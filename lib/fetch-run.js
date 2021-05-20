'use strict'

const fetchShape = require('./fetch-shape')

// The term "run" isn't explicitly used in the GTFS-Static/GTFS-Realtime specs,
// but it is used implicitly many times and there has been a proposal to
// introduce it (https://github.com/google/transit/pull/195). Within this code
// base, a "run" is an "instance" of a trip, on a specific date.
const fetchRun = async (db, trip_id, date) => {
	// retrive all arrivals/departures of the run
	const {rows: arrsDeps} = await db.query(`
		SELECT
			route_id,
			shape_id,
			stop_sequence,
			shape_dist_traveled,
			t_arrival,
			t_departure,
			arrivals_departures.stop_id,
			ST_AsGeoJSON(stops.stop_loc) as stop_loc
		FROM arrivals_departures
		INNER JOIN stops ON stops.stop_id = arrivals_departures.stop_id
		WHERE True
		-- find specific run
		AND trip_id = $1 AND date = $2
		ORDER BY stop_sequence
	`, [
		trip_id,
		date,
	])
	if (arrsDeps.length === 0) {
		throw new Error(`can't find run (shape_id ${shape_id}, date ${date})`)
	}

	const {route_id, shape_id} = arrsDeps[0]
	return {
		trip_id,
		date,
		route_id,
		shape: await fetchShape(db, shape_id),
		arrivalsDepartures: arrsDeps.map(ad => ({
			...ad,
			stop_loc: JSON.parse(ad.stop_loc),
		})),
	}
}

module.exports = fetchRun
