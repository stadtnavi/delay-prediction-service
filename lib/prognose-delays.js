'use strict'

const {DateTime} = require('luxon')
const {default: nearestPointOnLine} = require('@turf/nearest-point-on-line')
const logger = require('./logger')

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

const prognoseRunDelays = async (db, vehiclePos) => {
	const now = DateTime.fromMillis(Date.now(), {zone: TIMEZONE, locale: LOCALE})
	const {vehicleId, t} = vehiclePos
	// const dt = DateTime.fromMillis(t, {zone: TIMEZONE, locale: LOCALE})

	// try to match the recent vehicle positions
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
		// The vehicle position may be stale, e.g. a day old. We don't want to
		// generate prognoses for it, so we always use `now` for the time-related
		// filters.

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
	// const match = {
	// 	vehicleId: '14341fa0-5b00-11eb-98a5-133ebfea8661',
	// 	trip_id: '15.T0.31-782-j21-2.7.R',
	// 	date: '2021-05-17T00:00:00.000+01:00',
	// 	shape_id: '31-782-j21-2.7.R',
	// 	nr_of_consec_vehicle_pos: '11',
	// 	t_latest_vehicle_pos: '2021-05-17T13:04:09.833+01:00',
	// 	latest_vehicle_pos: JSON.stringify({type: 'Point', coordinates: [8.8684, 48.595]}),
	// }
	const {
		trip_id,
		date,
		shape_id,
		nr_of_consec_vehicle_pos,
		t_latest_vehicle_pos,
	} = match
	if (!trip_id) {
		logger.info({vehicleId}, 'vehicle has no match')
		return;
	}
	const latest_vehicle_pos = JSON.parse(match.latest_vehicle_pos)
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

	// retrieve the matched geographic shape
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

	// retrive all arrivals/departures of the matched "run"
	const {rows: arrs_deps} = await db.query(`
		SELECT
			stop_sequence,
			shape_dist_traveled,
			t_arrival,
			t_departure,
			arrivals_departures.stop_id,
			-- ST_AsGeoJSON(stops.stop_loc) as stop_loc,
			max(shape_dist_traveled) OVER (ORDER BY stop_sequence) AS total_dist_traveled
		FROM arrivals_departures
		INNER JOIN stops ON stops.stop_id = arrivals_departures.stop_id
		WHERE True
		-- find specific "run"
		AND trip_id = $1 AND date = $2
		ORDER BY stop_sequence
	`, [
		trip_id, date,
	])
	console.error(arrs_deps)

	// todo: prognose delay
	const p = nearestPointOnLine(shape, latest_vehicle_pos)
	const vehicleDistTraveled = p.properties.location * 1000
	const prevOrCurrentArrDep = Array.from(arrs_deps).reverse()
	.find(ad => ad.shape_dist_traveled <= vehicleDistTraveled)
	const currentOrNextArrDep = arrs_deps
	.find(ad => ad.shape_dist_traveled >= vehicleDistTraveled)
	console.error({vehicleDistTraveled, prevOrCurrentArrDep, currentOrNextArrDep})

	return null
}

module.exports = prognoseRunDelays
