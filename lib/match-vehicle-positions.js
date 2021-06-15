'use strict'

const {DateTime} = require('luxon')
const logger = require('./logger')
const readTrajectories = require('./read-trajectories')
const matchVehiclePositionsWithTrajectory = require('./match-vehicle-positions-with-trajectory')

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
	const {rows: matchingRuns} = await db.query(`
		SELECT
			trip_id,
			date,
			shape_id
		FROM current_runs($1, $2, $3, $4)
	`, [
		// yesterday & today
		dt.minus({days: 1}).toISODate(), dt.toISODate(),
		// t_arrival_min
		// The vehicle may end a "run" up to 60m behind schedule.
		dt.minus({minutes: 60}).toISO(),
		// t_arrival_max
		// The vehicle may start a "run" up to 20m ahead of schedule.
		dt.plus({minutes: 20}).toISO(),
	])
	if (matchingRuns.length === 0) {
		logger.info({vehicleId, t}, 'vehicle has no matching run')
		return null
	}

	// todo: pre-filter by latest vehicle position
	const {rows: positions} = await db.query(`
		SELECT
			id as pos_id,
			vehicle_id,
			ST_X(location::geometry) AS longitude,
			ST_Y(location::geometry) AS latitude,
			hdop,
			t
		FROM vehicle_positions
		WHERE True
		AND vehicle_id = $3
		-- When filtering vehicle positions, we pick a longer time range. If the
		-- vehicle has a delay of n minutes, we still need to find its positions
		-- *older* than n minutes, in order to reliably identify its "run".
		AND t >= $1 AND t <= $2
		ORDER BY t DESC
		LIMIT 200
	`, [
		// t_vehicle_pos_min
		// The vehicle may be up to 60m behind schedule.
		dt.minus({minutes: 60}).toISO(),
		// t_vehicle_pos_max
		// The vehicle may be up to 20m ahead of schedule.
		dt.plus({minutes: 20}).toISO(),
		// vehicle_id
		vehicleId,
	])
	positions.reverse()
	logger.debug({nr: positions.length}, 'fetched last vehicle positions')

	const trajectoryIds = new Array(matchingRuns.length)
	for (let i = 0, l = matchingRuns.length; i < l; i++) {
		const {trip_id, date} = matchingRuns[i]
		// see compute-trajectories.js for file names
		trajectoryIds[i] = trip_id + '-' + date.slice(0, 4 + 1 + 2 + 1 + 2)
	}

	const t0 = Date.now()
	let bestScore = Infinity, secondBestScore = Infinity
	let bestTr = null, secondBestTr = Infinity
	for await (const tr of readTrajectories(trajectoryIds)) {
		const score = matchVehiclePositionsWithTrajectory(positions, tr)
		logger.debug({
			tr: tr.properties.id,
			score,
		}, 'matched')
		if (score < bestScore) {
			secondBestScore = bestScore
			bestScore = score
			secondBestTr = bestTr
			bestTr = tr
		} else if (score < secondBestScore) {
			secondBestScore = score
			secondBestTr = tr
		}
	}
	const matchingDuration = Date.now() - t0

	if (!bestTr) {
		logger.info({matchingDuration}, 'no match')
		return null
	}
	if (bestScore / secondBestScore > .8) {
		logger.info({
			bestScore, bestTr: bestTr.properties.id,
			secondBestScore, secondBestTr: secondBestTr.properties.id,
			matchingDuration,
		}, 'best score & 2nd-best score too close')
		return null
	}
	if (bestScore > 50) {
		logger.info({
			bestScore, bestTr: bestTr.properties.id,
			matchingDuration,
		}, 'best score is too bad')
		return null
	}

	const _ = bestTr.properties
	const latestVehiclePos = positions[positions.length - 1]
	const runMatch = {
		vehicleId,
		score: bestScore,
		secondBestScore,
		matchingDuration,
		trip_id: _.tripId,
		date: _.date,
		shape_id: _.shapeId,
		latestVehiclePos: {
			type: 'Point',
			coordinates: [latestVehiclePos.longitude, latestVehiclePos.latitude],
		},
		tLatestVehiclePos: latestVehiclePos.t,
	}
	logger.info(runMatch, 'vehicle has a match!')
	return runMatch
}

module.exports = matchRunFromVehiclePositions
