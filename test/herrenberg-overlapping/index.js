#!/usr/bin/env node
'use strict'

// const {request} = require('http')
const {join: pathJoin} = require('path')
const {readdir, readFile} = require('fs/promises')
const execa = require('execa')
const {Client: PostgresClient} = require('pg')
const {transit_realtime: {
	FeedMessage,
	FeedHeader: {Incrementality},
}} = require('gtfs-realtime-bindings')
const {deepStrictEqual: eql, ok} = require('assert')

const abortWithError = (err) => {
	console.error(err)
	process.exit(1)
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

	const env = {
		// todo: thingsboard
		TIMEZONE: 'Europe/Berlin',
		LOCALE: 'de-DE',
		GTFS_ID: 'test',
		TRAJECTORIES_DIR: pathJoin(__dirname, 'trajectories'),
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

	const svc = execa('node', ['index.js'], {
		cwd: pathJoin(__dirname, '..', '..'),
		stdout: 'inherit',
		stderr: 'inherit',
		env: {
			...env,
			PUBLISH_VIA_MQTT: 'false',
			READ_VEHICLE_POSITIONS_FROM_STDIN: 'true',
		},
	})
	svc.catch((err) => {
		if (err && !err.isCanceled) abortWithError(err)
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
		// todo: generate timestamp from latest FeedEntity
		ok(+header.timestamp > 1623939743, 'header.timestamp')

		// 1 raw VehiclePosition, 1 predicted VehiclePosition, 1 TripUpdate
		const expectedNrOfEntities = 3
		ok(entities.length, expectedNrOfEntities, 'nr of entities')

		const vPRaw = entities.find(e => e.vehicle?.vehicle?.id === VEHICLE_ID + '-raw')
		ok(vPRaw, 'missing raw VehiclePosition')
		eql(+vPRaw.vehicle.timestamp, 1623670816, 'raw VehiclePosition: invalid timestamp')
		eql(+vPRaw.vehicle.position?.latitude.toFixed(5), 48.6019, 'raw VehiclePosition: invalid position.latitude')
		eql(+vPRaw.vehicle.position?.longitude.toFixed(5), 8.8897, 'raw VehiclePosition: invalid position.longitude')

		const vPPredicted = entities.find(e => e.vehicle?.vehicle?.id === VEHICLE_ID)
		ok(vPPredicted, 'missing predicted VehiclePosition')
		eql(+vPPredicted.vehicle.position?.latitude.toFixed(4), 48.602, 'predicted VehiclePosition: invalid position.latitude')
		eql(+vPPredicted.vehicle.position?.longitude.toFixed(4), 8.8898, 'predicted VehiclePosition: invalid position.longitude')
		eql(vPPredicted.vehicle.trip?.tripId, '45.T0.31-782-j21-1.5.H', 'predicted VehiclePosition: invalid trip.tripId')
		eql(vPPredicted.vehicle.trip?.routeId, '31-782-j21-1', 'predicted VehiclePosition: invalid trip.routeId')
		eql(vPPredicted.vehicle.trip?.scheduleRelationship, 0, 'predicted VehiclePosition: invalid trip.scheduleRelationship')
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

	// stop service
	svc.cancel()
})()
.catch(abortWithError)
