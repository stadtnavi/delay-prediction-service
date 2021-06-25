#!/usr/bin/env node
'use strict'

// const {request} = require('http')
const {join: pathJoin} = require('path')
const {readdir, readFile} = require('fs/promises')
const execa = require('execa')
const {promisify} = require('util')
const {transit_realtime: {
	FeedMessage,
	FeedHeader: {Incrementality},
	VehiclePosition: {VehicleStopStatus, OccupancyStatus},
}} = require('gtfs-realtime-bindings')
const {deepStrictEqual: eql, ok} = require('assert')
const importTestData = require('../lib/import-test-data')
const startMQTTServerAndClient = require('../lib/mqtt-broker-client')

const abortWithError = (err) => {
	console.error(err)
	process.exit(1)
}

;(async () => {
	const trajectoriesDir = pathJoin(__dirname, 'trajectories')
	await importTestData({
		dbName: 'test_planned_positions',
		gtfsDir: __dirname,
		trajectoriesDir,
	})

	const MOCK_T0 = 1624451400000 // 2021-06-23T14:30+02:00
	const env = {
		TIMEZONE: 'Europe/Berlin',
		LOCALE: 'de-DE',
		GTFS_ID: 'test_planned_positions',
		TRAJECTORIES_DIR: trajectoriesDir,
		MOCK_T0: MOCK_T0 + '',
	}

	// start MQTT broker & client
	const {
		MQTT_URI, client: mqttClient,
		stop: stopMQTTClientAndServer,
	} = await startMQTTServerAndClient()
	await promisify(mqttClient.subscribe.bind(mqttClient))('/gtfsrt/#')
	await promisify(mqttClient.subscribe.bind(mqttClient))('/json/#')
	const receivedViaMQTT = []
	mqttClient.on('message', (topic, msg) => {
		receivedViaMQTT.push([topic, msg])
	})

	const svc = execa('node', ['index.js'], {
		cwd: pathJoin(__dirname, '..', '..'),
		stdin: 'ignore',
		stdout: 'inherit',
		stderr: 'inherit',
		env: {
			...env,
			MQTT_URI,
			READ_VEHICLE_POSITIONS_FROM_STDIN: 'true',
			PLANNED_VEHICLE_POSITIONS_INTERVAL: '5', // 5s
		},
	})
	svc.catch((err) => {
		if (err && !err.isCanceled) abortWithError(err)
	})

	const expectedVehiclePositions = [{
		mode: 'bus',
		vehicleId: '7730030.T0.31-773-j21-4.2.H-2021-06-23',
		timestamp: 1624451405,
		route_id: '31-773-j21-4',
		trip_id: '7730030.T0.31-773-j21-4.2.H',
		start_date: '20210623', start_time: '14:21:00',
		longitude: 8.853148460388184,
		latitude: 48.60953140258789,
		bearing: 249.1,
	}, {
		mode: 'bus',
		vehicleId: '7730066.T0.31-773-j21-4.24.R-2021-06-23',
		timestamp: 1624451405,
		route_id: '31-773-j21-4',
		trip_id: '7730066.T0.31-773-j21-4.24.R',
		start_date: '20210623', start_time: '14:20:00',
		longitude: 8.853199005126953,
		latitude: 48.60918426513672,
		bearing: 69.5,
	}, {
		mode: 'bus',
		vehicleId: '7730101.T0.31-773-j21-4.24.R-2021-06-23',
		timestamp: 1624451405,
		route_id: '31-773-j21-4',
		trip_id: '7730101.T0.31-773-j21-4.24.R',
		start_date: '20210623', start_time: '13:31:00',
		longitude: 8.86146354675293,
		latitude: 48.59440994262695,
		bearing: 60.1,
	}, {
		mode: 'bus',
		vehicleId: '7730102.T0.31-773-j21-4.23.R-2021-06-23',
		timestamp: 1624451405,
		route_id: '31-773-j21-4',
		trip_id: '7730102.T0.31-773-j21-4.23.R',
		start_date: '20210623', start_time: '13:31:00',
		longitude: 8.861371994018555,
		latitude: 48.594181060791016,
		bearing: 242,
	}, {
		mode: 'bus',
		vehicleId: '7730104.T0.31-773-j21-4.28.R-2021-06-23',
		timestamp: 1624451405,
		route_id: '31-773-j21-4',
		trip_id: '7730104.T0.31-773-j21-4.28.R',
		start_date: '20210623', start_time: '14:20:00',
		longitude: 8.77170467376709,
		latitude: 48.695579528808594,
		bearing: 339.3,
	}, {
		mode: 'bus',
		vehicleId: '8.T0.31-780-j21-2.2.H-2021-06-23',
		timestamp: 1624451405,
		route_id: '31-780-j21-2',
		trip_id: '8.T0.31-780-j21-2.2.H',
		start_date: '20210623', start_time: '14:20:00',
		longitude: 8.849973678588867,
		latitude: 48.59585189819336,
		bearing: 176.6,
	}, {
		mode: 'bus',
		vehicleId: '17.T0.31-782-j21-1.7.R-2021-06-23',
		route_id: '31-782-j21-1',
		trip_id: '17.T0.31-782-j21-1.7.R',
		start_date: '20210623', start_time: '14:20:00',
		longitude: 8.875743865966797,
		latitude: 48.59011459350586,
		timestamp: 1624451405,
		bearing: 252.9,
	}, {
		mode: 'bus',
		vehicleId: '47.T0.31-782-j21-1.5.H-2021-06-23',
		timestamp: 1624451405,
		route_id: '31-782-j21-1',
		trip_id: '47.T0.31-782-j21-1.5.H',
		start_date: '20210623', start_time: '14:21:00',
		longitude: 8.880294799804688,
		latitude: 48.59241485595703,
		bearing: 33.3,
	}]
	const expectVehiclePosition = (feedMsg, expected) => {
		const {
			vehicleId,
			timestamp,
			route_id,
			trip_id, start_date, start_time,
			longitude, latitude, bearing,
		} = expected

		const msg = `expected VehiclePosition (vehicleId = "${vehicleId}")`
		ok(feedMsg, `${msg}: no FeedMessage found`)
		const vP = feedMsg.vehicle

		ok(vP.timestamp * 1000 >= MOCK_T0, `${msg}: invalid timestamp`)
		eql(vP.trip?.routeId, route_id, `${msg}: invalid route_id`)
		eql(vP.trip?.tripId, trip_id, `${msg}: invalid trip_id`)
		eql(vP.trip?.startDate, start_date, `${msg}: invalid start_date`)
		eql(vP.trip?.startTime, start_time, `${msg}: invalid start_time`)
		eql(vP.position?.longitude, longitude, `${msg}: invalid longitude`)
		eql(vP.position?.latitude, latitude, `${msg}: invalid latitude`)
		eql(+vP.position?.bearing?.toFixed(1), bearing, `${msg}: invalid bearing`)
	}

	await new Promise(resolve => setTimeout(resolve, 9 * 1000))

	// { // test GTFS-RT feed served via HTTP
	// 	// todo: DRY with test/herrenberg-overlapping
	// 	// todo: http.request runs endlessly, but curl works. why?
	// 	// const res = await pRequest('http://localhost:3000/', {
	// 	// 	headers: {
	// 	// 		'accept': 'application/json',
	// 	// 	},
	// 	// })
	// 	// const body = await new Promise((resolve, reject) => {
	// 	// 	res.once('error', reject)
	// 	// 	let data = Buffer.alloc(0)
	// 	// 	res.on('data', (chunk) => data = Buffer.concat([data, chunk]))
	// 	// 	res.once('end', () => resolve(data))
	// 	// })
	// 	const {stdout: body} = await execa('curl', [
	// 		'-H', 'accept: application/json',
	// 		'-s',
	// 		'http://localhost:3000',
	// 	], {
	// 		// get stdout + stderr as raw Buffer
	// 		stripFinalNewline: false,
	// 		encoding: null,
	// 	})
	// 	const {header, entity: entities} = FeedMessage.decode(body)

	// 	eql(header.gtfsRealtimeVersion, '2.0', 'header.gtfsRealtimeVersion')
	// 	eql(header.incrementality, Incrementality.FULL_DATASET, 'header.incrementality')
	// 	ok(header.timestamp * 1000 >= MOCK_T0, 'header.timestamp')

	// 	const expectedNrOfEntities = expectedVehiclePositions.length
	// 	eql(entities.length, expectedNrOfEntities, 'nr of entities')

	// 	for (const expected of expectedVehiclePositions) {
	// 		const {vehicleId} = expected
	// 		const feedMsg = entities.find(feedMsg => feedMsg.vehicle?.vehicle?.id === vehicleId)
	// 		expectVehiclePosition(feedMsg, expected)
	// 	}

	// 	console.info('GTFS-RT served via HTTP looks good ✔︎')
	// }

	{ // test GTFS-RT messages sent via MQTT
		for (const expected of expectedVehiclePositions) {
			const {mode, trip_id} = expected
			const msg = `expected VehiclePosition (mode = ${mode}, tripId = "${trip_id}")`

			const match = receivedViaMQTT.find(([topic]) => {
				const [, encoding, type, feed_id,,, mode, route_id,,, trip_id] = topic.split('/')
				return (
					encoding === 'gtfsrt' && type === 'vp' && feed_id === 'hbg' &&
					mode === expected.mode && route_id === expected.route_id &&
					trip_id === expected.trip_id
				)
			})
			ok(match, `${msg}: no FeedMessage found`)
			const feedMsg = FeedMessage.toObject(FeedMessage.decode(match[1]))
			expectVehiclePosition(feedMsg.entity[0], expected)
		}

		console.info('GTFS-RT sent via MQTT looks good ✔︎')
	}

	// stop service
	svc.cancel()
	await stopMQTTClientAndServer()
})()
.catch(abortWithError)
