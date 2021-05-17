'use strict'

const {Transform} = require('stream')
const {DateTime} = require('luxon')
const {default: nearestPointOnLine} = require('@turf/nearest-point-on-line')
const logger = require('./lib/logger')
const subscribeToVehiclePositions = require('./lib/vehicle-positions')
const {runWithinTx} = require('./lib/db')

const TIMEZONE = process.env.TIMEZONE
if (!TIMEZONE) {
	console.error('Missing/empty TIMEZONE environment variable.')
	process.exit(1)
}
const LOCALE = process.env.LOCALE
if (!LOCALE) {
	console.error('Missing/empty LOCALE environment variable.')
	process.exit(1)
}

const abortWithError = (err) => {
	logger.error(err)
	process.exit(1)
}

const processVehiclePosition = async (db, vehiclePos) => {
	logger.debug({vehiclePos})
	const {vehicleId, latitude, longitude, hdop, t} = vehiclePos

	const dt = DateTime.fromMillis(t, {zone: TIMEZONE, locale: LOCALE})
	await db.query(`
		INSERT INTO vehicle_positions (vehicle_id, location, hdop, t)
		VALUES ($1, $2, $3, $4)
		ON CONFLICT ON CONSTRAINT vehicle_positions_unique DO UPDATE SET
			location = EXCLUDED.location,
			hdop = EXCLUDED.hdop;
	`, [
		vehicleId,
		`POINT(${longitude} ${latitude})`,
		hdop,
		dt.toISO(),
	])

	const now = DateTime.fromMillis(Date.now(), {zone: TIMEZONE, locale: LOCALE})
	const {rows: [match]} = await db.query(`
		SELECT
			trip_id,
			date,
			shape_id,
			nr_of_consec_vehicle_pos,
			t_latest_vehicle_pos,
			ST_AsGeoJSON(latest_vehicle_pos) as latest_vehicle_pos
		FROM vehicle_match($1, $2, $3, $4, $5, $6, $7)
	`, [
		// yesterday & today
		now.toISODate(), now.minus({days: 1}).toISODate(),
		// t_arrival_min
		// The vehicle may end a "run" up to 60m behind schedule.
		now.minus({minutes: 60}).toISO(),
		// t_arrival_max
		// The vehicle may start a "run" up to 20m ahead of schedule.
		now.plus({minutes: 20}).toISO(),
		// t_vehicle_pos_min
		// The vehicle may be up to 60m behind schedule.
		now.minus({minutes: 60}).toISO(),
		// t_vehicle_pos_max
		// The vehicle may be up to 20m ahead of schedule.
		now.plus({minutes: 60}).toISO(),
		// vehicle_id
		vehicleId,
	])
	const {
		trip_id,
		date,
		shape_id,
		nr_of_consec_vehicle_pos,
		t_latest_vehicle_pos,
	} = match
	const latest_vehicle_pos = JSON.parse(match.latest_vehicle_pos)
	if (!trip_id) {
		logger.info({vehicleId}, 'vehicle has no match')
		return;
	}
	logger.info({
		vehicleId,
		trip_id,
		date,
		shape_id,
		nr_of_consec_vehicle_pos,
		t_latest_vehicle_pos,
		latest_vehicle_pos,
		nrOfMatchingVehiclePositions: parseInt(nr_of_consec_vehicle_pos),
	}, 'vehicle has a match!')

	let {rows: [{shape}]} = await db.query(`
		SELECT
			ST_AsGeoJSON(shape) as shape
		FROM shapes_aggregated
		WHERE shape_id = $1
		LIMIT 1
	`, [
		shape_id,
	])
	shape = JSON.parse(shape)
	const {
		properties: {location: latestVehiclePosTravelled},
	} = nearestPointOnLine(shape, latest_vehicle_pos)

	// todo: match arrivals/departures, prognose delay
	// const {rows: arrs_deps} = await db.query(`
	// 	SELECT
	// 		stop_sequence,
	// 		shape_dist_traveled,
	// 		t_arrival,
	// 		t_departure,
	// 		arrivals_departures.stop_id,
	// 		-- ST_AsGeoJSON(stops.stop_loc) as stop_loc,
	// 		max(shape_dist_traveled) OVER (ORDER BY stop_sequence) AS total_dist_traveled
	// 	FROM arrivals_departures
	// 	INNER JOIN stops ON stops.stop_id = arrivals_departures.stop_id
	// 	WHERE True
	// 	-- find specific "run"
	// 	AND trip_id = $1 AND date = $2
	// 	ORDER BY stop_sequence
	// `, [
	// 	trip_id, date,
	// ])
	// const prevOrCurrentArrDep = Array.from(arrs_deps).reverse().find(ad => new Date(ad.t_arrival) <= dt)
	// const currentOrNextArrDep = arrs_deps.find(ad => new Date(ad.departure) >= dt)
}

subscribeToVehiclePositions()
.on('error', abortWithError)
.pipe(new Transform({
	objectMode: true,
	transform: (vehiclePos, _, cb) => {
		runWithinTx(async (db) => {
			await processVehiclePosition(db, vehiclePos)
		})
		.then(() => cb(), cb)
	}
}))
.on('error', abortWithError)
