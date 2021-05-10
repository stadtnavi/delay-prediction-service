'use strict'

const pgFormat = require('pg-format')
const {DateTime} = require('luxon')
const logger = require('./logger')

// todo: find a more elegant solution (see below)
const tripIdsByShapeId = require('../trip-ids-by-shape-id.json')

// Maximum amount a vehicle can be late or ahead of time, in milliseconds.
const MAX_DELAY = 5 * 60 * 60 * 1000 // 5h
const MAX_AHEAD = 2 * 60 * 60 * 1000 // 2h

const TIMEZONE = process.env.TIMEZONE
if (!TIMEZONE) {
	console.error('Missing TIMEZONE environment variable.')
	process.exit(1)
}
const LOCALE = process.env.LOCALE
if (!LOCALE) {
	console.error('Missing LOCALE environment variable.')
	process.exit(1)
}

const findTripCandidates = async (dbClient, shapeId) => {
	// gtfs-via-postgres@2.9.0 is very slow (~1.5s) when filtering
	// arrivals_departures by shape_id. This is why we also filter by trip_id.
	// https://explain.dalibo.com/plan/XNL
	// todo: make gtfs-via-postgres faster, remove this workaround
	const possibleTripIds = tripIdsByShapeId[shapeId]
	if (!possibleTripIds) {
		logger.error({shapeId}, 'no trips known for this shape')
		return []
	}
	console.error('possibleTripIds', possibleTripIds.length)

	const now = DateTime.fromMillis(Date.now(), {
		zone: TIMEZONE,
		locale: LOCALE,
	})

	// Find all trips with the given shape ID that have a recent or upcoming
	// arrival. Thus, we filter by time (tArrivalMin & tArrivalMax) and by
	// geographic location (shapeId).
	const query = pgFormat(`
		SELECT
			DISTINCT ON (arrivals_departures.trip_id, arrivals_departures.service_id) arrivals_departures.trip_id,
			arrivals_departures.service_id
		FROM arrivals_departures
		LEFT JOIN trips ON trips.trip_id = arrivals_departures.trip_id
		WHERE True
		-- cut off by date for better performance
		AND (date = $1 OR date = $2)
		AND t_arrival >= $3 AND t_arrival <= $4
		AND arrivals_departures.trip_id IN %L
		AND trips.shape_id = $5
	`, [
		possibleTripIds,
	])
	const params = [
		// todo: does this break if the DB has a different tz?
		now.minus({days: 1}).toISO().slice(0, 10),
		now.toISO().slice(0, 10),
		now.minus(MAX_DELAY).toISO(),
		now.plus(MAX_AHEAD).toISO(),
		shapeId,
	]
	logger.debug({query, params})

	const {rows} = await dbClient.query(query, params)
	const candidates = rows.map(c => c.trip_id)
	logger.debug({nrOfCandidates: candidates.length, candidates})

	return candidates
}

module.exports = findTripCandidates
