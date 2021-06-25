'use strict'

const {DateTime} = require('luxon')
const logger = require('./logger')
const tNow = require('./t-now')
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

// Maximum age the *latest* vehicle position can have to be used
// for a prediction.
const MAX_VEHICLE_POS_AGE = 10 * 60 * 1000 // 10m

const matchRunFromVehiclePositions = async (db, vehicleId, t) => {
	const dt = DateTime.fromMillis(t, {zone: TIMEZONE, locale: LOCALE})
	const {rows: matchingRuns} = await db.query(`
		SELECT
			route_id,
			route_short_name,
			trip_id,
			trip_headsign,
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
			pax,
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

	const latestVehiclePos = positions[positions.length - 1]
	if ((tNow() - Date.parse(latestVehiclePos.t)) > MAX_VEHICLE_POS_AGE) {
		logger.info({
			tLatestVehiclePos: latestVehiclePos.t,
		}, 'latest vehicle position is too old')
		return null
	}

	const runsByTrajectoryId = new Map()
	const trajectoryIds = new Array(matchingRuns.length)
	for (let i = 0, l = matchingRuns.length; i < l; i++) {
		const run = matchingRuns[i]
		const date = run.date.slice(0, 4 + 1 + 2 + 1 + 2)
		const trajectoryId = run.trip_id + '-' + date

		trajectoryIds[i] = trajectoryId
		runsByTrajectoryId.set(trajectoryId, run)
	}

	const t0 = tNow()
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
	const matchingDuration = tNow() - t0

	if (!bestTr) {
		logger.info({matchingDuration}, 'no match')
		return null
	}
	if (bestScore > 100) {
		logger.info({
			bestScore, bestTr: bestTr.properties.id,
			matchingDuration,
		}, 'best score is too bad')
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

	const run = runsByTrajectoryId.get(bestTr.properties.id)
	const runMatch = {
		vehicleId,
		score: bestScore,
		secondBestScore,
		matchingDuration,
		route_id: run.route_id, route_short_name: run.route_short_name,
		trip_id: run.trip_id, trip_headsign: run.trip_headsign,
		date: run.date.slice(0, 4 + 1 + 2 + 1 + 2),
		shape_id: run.shape_id,
		latestVehiclePos: {
			type: 'Point',
			coordinates: [latestVehiclePos.longitude, latestVehiclePos.latitude],
		},
		tLatestVehiclePos: latestVehiclePos.t,
		latestVehiclePax: latestVehiclePos.pax,
	}
	logger.info(runMatch, 'vehicle has a match!')
	return runMatch
}

module.exports = matchRunFromVehiclePositions
