#!/usr/bin/env node
'use strict'

const {connect} = require('mqtt')
// const {request} = require('http')
const {join: pathJoin} = require('path')
const {readdir, readFile} = require('fs/promises')
const execa = require('execa')
const aedes = require('aedes')
const {createServer: createTCPServer} = require('net')
const {promisify} = require('util')
const {Client: PostgresClient} = require('pg')
const {transit_realtime: {
	FeedMessage,
	FeedHeader: {Incrementality},
	VehiclePosition: {VehicleStopStatus, OccupancyStatus},
}} = require('gtfs-realtime-bindings')
const {deepStrictEqual: eql, ok} = require('assert')

const abortWithError = (err) => {
	console.error(err)
	process.exit(1)
}

const connectToMQTT = (uri) => {
	return new Promise((resolve, reject) => {
		const client = connect(uri)
		setTimeout(() => {
			reject(new Error('timeout connecting to MQTT broker'))
			client.end()
		}, 1000)
		client.once('connect', () => resolve(client))
	})
}

;(async () => {
	{ // create "test" PostgreSQL DB
		const db = new PostgresClient({
			database: 'postgres'
		})
		await db.connect()
		const {rows} = await db.query(`SELECT FROM pg_database WHERE datname = 'test'`)
		if (rows.length === 0) { // DB "test" does not exist
			await db.query('CREATE DATABASE test')
		}
		db.end()
	}

	const MOCK_T0 = 1623670817000
	const env = {
		// todo: thingsboard
		TIMEZONE: 'Europe/Berlin',
		LOCALE: 'de-DE',
		GTFS_ID: 'test',
		TRAJECTORIES_DIR: pathJoin(__dirname, 'trajectories'),
		MOCK_T0: MOCK_T0 + '',
	}

	{ // import GTFS into PostgreSQL DB
		const gtfsToSql = require.resolve('gtfs-via-postgres/cli.js')
		const files = (await readdir(__dirname)).filter(f => f.slice(-4) === '.txt')
		await execa.command([
			gtfsToSql,
			'-d --routes-without-agency-id --trips-without-shape-id',
			'--', ...files,
			'| sponge',
			'| psql -b'
		].join(' '), {
			shell: true,
			cwd: __dirname,
			env: {
				...env,
				PGDATABASE: 'test',
			},
			stdio: 'inherit',
		})
	}

	{ // deploy SQL schema to PostgreSQL DB
		await execa.command('psql -b -f deploy.sql', {
			shell: true,
			cwd: pathJoin(__dirname, '..', '..'),
			env: {
				...env,
				PGDATABASE: 'test',
			},
			stdio: 'inherit',
		})
	}

	{ // generate trajectories
		// todo: remove old trajectories first
		const computeTrajectories = pathJoin(__dirname, '..', '..', 'compute-trajectories.js')
		await execa(computeTrajectories, {
			cwd: __dirname,
			env: {
				...env,
				GTFS_DIR: __dirname,
			},
			stdio: 'inherit',
		})
	}

	// start MQTT Broker
	const mqttServer = createTCPServer(aedes().handle)
	const stopMQTTBroker = async () => {
		await promisify(mqttServer.close.bind(mqttServer))()
	}
	await promisify(mqttServer.listen.bind(mqttServer))(30883)
	const MQTT_URI = 'mqtt://localhost:30883'

	const svc = execa('node', ['index.js'], {
		cwd: pathJoin(__dirname, '..', '..'),
		stdout: 'inherit',
		stderr: 'inherit',
		env: {
			...env,
			MQTT_URI,
			READ_VEHICLE_POSITIONS_FROM_STDIN: 'true',
			SEND_PLANNED_VEHICLE_POSITIONS: 'false',
		},
	})
	svc.catch((err) => {
		if (err && !err.isCanceled) abortWithError(err)
	})

	const mqttClient = await connectToMQTT(MQTT_URI)
	await promisify(mqttClient.subscribe.bind(mqttClient))('/gtfsrt/#')
	await promisify(mqttClient.subscribe.bind(mqttClient))('/json/#')
	const receivedViaMQTT = []
	mqttClient.on('message', (topic, msg) => {
		receivedViaMQTT.push([topic, msg])
	})

	{ // insert vehicle positions
		const file = pathJoin(__dirname, 'vehicle-positions.ndjson')
		const vehiclePositions = await readFile(file, {encoding: 'utf8'})
		svc.stdin.end(vehiclePositions)
	}
	const VEHICLE_ID = '14341fa0-5b00-11eb-98a5-133ebfea8661'

	await new Promise(resolve => setTimeout(resolve, 5 * 1000))

	{ // test GTFS-RT feed served via HTTP
		// todo: http.request runs endlessly, but curl works. why?
		// const res = await pRequest('http://localhost:3000/', {
		// 	headers: {
		// 		'accept': 'application/json',
		// 	},
		// })
		// const body = await new Promise((resolve, reject) => {
		// 	res.once('error', reject)
		// 	let data = Buffer.alloc(0)
		// 	res.on('data', (chunk) => data = Buffer.concat([data, chunk]))
		// 	res.once('end', () => resolve(data))
		// })
		const {stdout: body} = await execa('curl', [
			'-H', 'accept: application/json',
			'-s',
			'http://localhost:3000',
		], {
			// get stdout + stderr as raw Buffer
			stripFinalNewline: false,
			encoding: null,
		})
		const {header, entity: entities} = FeedMessage.decode(body)

		eql(header.gtfsRealtimeVersion, '2.0', 'header.gtfsRealtimeVersion')
		eql(header.incrementality, Incrementality.FULL_DATASET, 'header.incrementality')
		ok(header.timestamp * 1000 >= MOCK_T0, 'header.timestamp')

		// 1 raw VehiclePosition, 1 predicted VehiclePosition, 1 TripUpdate
		const expectedNrOfEntities = 3
		ok(entities.length, expectedNrOfEntities, 'nr of entities')

		const vPPredicted = entities.find(e => e.vehicle?.vehicle?.id === VEHICLE_ID)
		ok(vPPredicted, 'missing predicted VehiclePosition')
		// todo
		// eql(+vPPredicted.vehicle.position?.latitude.toFixed(3), 48.602, 'predicted VehiclePosition: invalid position.latitude')
		// eql(+vPPredicted.vehicle.position?.longitude.toFixed(2), 8.89, 'predicted VehiclePosition: invalid position.longitude')
		// eql(Math.round(vPPredicted.vehicle.position?.bearing), 89, 'predicted VehiclePosition: invalid position.bearing')
		eql(vPPredicted.vehicle.trip?.tripId, '45.T0.31-782-j21-1.5.H', 'predicted VehiclePosition: invalid trip.tripId')
		eql(vPPredicted.vehicle.trip?.routeId, '31-782-j21-1', 'predicted VehiclePosition: invalid trip.routeId')
		eql(vPPredicted.vehicle.trip?.scheduleRelationship, 0, 'predicted VehiclePosition: invalid trip.scheduleRelationship')
		eql(vPPredicted.vehicle.currentStopSequence, 10, 'predicted VehiclePosition: invalid currentStopSequence')
		eql(vPPredicted.vehicle.stopId, 'de:08115:4800:0:3', 'predicted VehiclePosition: invalid stopId')
		eql(vPPredicted.vehicle.currentStatus, VehicleStopStatus.IN_TRANSIT_TO, 'predicted VehiclePosition: invalid currentStatus')
		eql(vPPredicted.vehicle.occupancyStatus, OccupancyStatus.MANY_SEATS_AVAILABLE, 'predicted VehiclePosition: invalid occupancyStatus')
		// todo: assert more

		const tU = entities.find(e => !!e.tripUpdate)
		ok(tU, 'missing TripUpdate')
		eql(tU.tripUpdate.trip?.tripId, '45.T0.31-782-j21-1.5.H', 'TripUpdate: invalid trip.tripId')
		eql(tU.tripUpdate.trip?.routeId, '31-782-j21-1', 'TripUpdate: invalid trip.routeId')
		eql(tU.tripUpdate.trip?.scheduleRelationship, 0, 'TripUpdate: invalid trip.scheduleRelationship')
		// todo: assert stop time updates
		eql(tU.tripUpdate.delay, 241, 'TripUpdate: invalid delay')

		console.info('GTFS-RT served via HTTP looks good ✔︎')
	}

	await new Promise(resolve => setTimeout(resolve, 5 * 1000))

	{ // test GTFS-RT messages sent via MQTT
		const latestMsg = (topic) => Array.from(receivedViaMQTT).reverse().find(([t]) => t === topic)

		const vPRawPBF = latestMsg('/gtfsrt/vp-raw/14341fa0-5b00-11eb-98a5-133ebfea8661')
		ok(vPRawPBF, 'missing raw pbf-encoded VehiclePosition')
		const vPRawJSON = latestMsg('/json/vp-raw/14341fa0-5b00-11eb-98a5-133ebfea8661')
		ok(vPRawJSON, 'missing raw JSON-encoded VehiclePosition')

		const vPPredictedPBF = latestMsg('/gtfsrt/vp/hbg/1/1/bus/31-782-j21-1/0/Herrenberg Waldfriedhof/45.T0.31-782-j21-1.5.H/de:08115:4800:0:3/13:21:00/14341fa0-5b00-11eb-98a5-133ebfea8661/48;8./.8/68/09/782')
		ok(vPPredictedPBF, 'missing predicted pbf-encoded VehiclePosition')
		const vPPredictedJSON = latestMsg('/json/vp/hbg/1/1/bus/31-782-j21-1/0/Herrenberg Waldfriedhof/45.T0.31-782-j21-1.5.H/de:08115:4800:0:3/13:21:00/14341fa0-5b00-11eb-98a5-133ebfea8661/48;8./.8/68/09/782')
		ok(vPPredictedJSON, 'missing predicted JSON-encoded VehiclePosition')

		const vPPredicted = FeedMessage.decode(vPPredictedPBF[1])
		eql(vPPredicted.header.incrementality, Incrementality.DIFFERENTIAL, 'predicted vehicle pos: FeedHeader.incrementality')
		// expected: time of latest vehicle pos
		eql(+vPPredicted.header.timestamp, 1623670816, 'vpredicted vehicle pos: FeedHeader.timestamp')
		// expected: time of prediction
		ok(+vPPredicted.entity[0].vehicle.timestamp > 1623670816, 'vpredicted vehicle pos: VehiclePosition.timestamp')

		const tUPBF = latestMsg('/gtfsrt/tu/14341fa0-5b00-11eb-98a5-133ebfea8661')
		ok(tUPBF, 'missing pbf-encoded TripUpdate')
		const tUJSON = latestMsg('/json/tu/14341fa0-5b00-11eb-98a5-133ebfea8661')
		ok(tUJSON, 'missing JSON-encoded TripUpdate')

		// todo: check message fields
		console.info('GTFS-RT sent via MQTT looks good ✔︎')
	}

	// stop service
	svc.cancel()
	mqttClient.end()
	await stopMQTTBroker()
})()
.catch(abortWithError)
