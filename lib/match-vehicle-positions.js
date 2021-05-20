'use strict'

const {DateTime} = require('luxon')
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

const matchRunFromVehiclePositions = async (db, vehicleId, t) => {
	const dt = DateTime.fromMillis(t, {zone: TIMEZONE, locale: LOCALE})
	const {rows: [_]} = await db.query(`
		SELECT
			trip_id,
			date,
			shape_id,
			nr_of_consec_vehicle_pos,
			ST_AsGeoJSON(latest_vehicle_pos) as latest_vehicle_pos,
			t_latest_vehicle_pos
		FROM vehicle_match($1, $2, $3, $4, $5, $6, $7)
	`, [
		// yesterday & today
		dt.minus({days: 1}).toISODate(), dt.toISODate(),
		// t_arrival_min
		// The vehicle may end a "run" up to 60m behind schedule.
		dt.minus({minutes: 60}).toISO(),
		// t_arrival_max
		// The vehicle may start a "run" up to 20m ahead of schedule.
		dt.plus({minutes: 20}).toISO(),
		// t_vehicle_pos_min
		// The vehicle may be up to 120m behind schedule.
		dt.minus({minutes: 120}).toISO(),
		// t_vehicle_pos_max
		// The vehicle may be up to 60m ahead of schedule.
		dt.plus({minutes: 60}).toISO(),
		// vehicle_id
		vehicleId,
	])
	if (!_ || !_.trip_id) {
		logger.info({vehicleId, t}, 'vehicle has no match')
		return null
	}

	const runMatch = {
		vehicleId,
		trip_id: _.trip_id,
		date: _.date,
		shape_id: _.shape_id,
		matchingConsecutiveVehiclePositions: _.nr_of_consec_vehicle_pos,
		latestVehiclePos: JSON.parse(_.latest_vehicle_pos),
		tLatestVehiclePos: _.t_latest_vehicle_pos,
	}
	logger.info(runMatch, 'vehicle has a match!')
	return runMatch
}

module.exports = matchRunFromVehiclePositions
