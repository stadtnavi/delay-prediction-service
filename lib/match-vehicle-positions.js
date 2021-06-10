'use strict'

const {default: distance} = require('@turf/distance')
const matchPointsWithShape = require('gtfs-utils/lib/match-points-with-shape')
const {DateTime} = require('luxon')
const logger = require('./logger')
const readTrajectories = require('./read-trajectories')
const {removePositionsBeforeDwelling} = require('./detect-dwelling')

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

const interpolateArrDep = (lower, upper, target) => {
	const fromDep = lower[4]
	const toArr = upper[3]
	const dTime = toArr - fromDep

	const lowerToTarget = distance(lower, target)
	const targetToUpper = distance(target, upper)
	const progress = lowerToTarget / (lowerToTarget + targetToUpper)

	target[3] = target[4] = Math.round(toArr + progress * dTime)
}

const matchVehiclePositionsWithTrajectory = (positions, tr) => {
	let score = 0
	let matchedPositions = 0

	// a vehicle might have dwelled at the terminal station for a while
	// and started a new run now
	// todo: handle this, e.g. by detecting dwelling at terminals?
	// todo: or by trying to match only slices of positions
	const trCoords = tr.geometry.coordinates
	const posPoints = positions.map(pos => [pos.longitude, pos.latitude])
	for (const match of matchPointsWithShape(trCoords, posPoints)) {
		const [i, i2, shapePt, distanceInKm, positionsI] = match
		const position = positions[positionsI]

		if (i !== i2) { // `shapePt` is not part of the trajectories
			interpolateArrDep(trCoords[i], trCoords[i2], shapePt)
		}
		const tExpected = shapePt[3] * 1000

		const dTimeInS = Math.abs((Date.parse(position.t) - tExpected) / 1000)
		// todo: add penalty for distances above common GPS hdop, e.g. 120m
		// todo: improve this spatial/temporal weighting
		score += distanceInKm * 1000 + dTimeInS / 10
		matchedPositions++
	}

	if (matchedPositions === 0) return Infinity
	return score / matchedPositions
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
		ORDER BY t ASC
	`, [
		// t_vehicle_pos_min
		// The vehicle may be up to 120m behind schedule.
		dt.minus({minutes: 120}).toISO(),
		// t_vehicle_pos_max
		// The vehicle may be up to 60m ahead of schedule.
		dt.plus({minutes: 60}).toISO(),
		// vehicle_id
		vehicleId,
	])

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
		const _pos = removePositionsBeforeDwelling(positions, tr)
		const score = matchVehiclePositionsWithTrajectory(_pos, tr)
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
	logger.debug({duration: Date.now() - t0}, `matching done`)
	if (!bestTr) return null
	if (bestScore / secondBestScore > .8) {
		logger.info({
			bestScore, bestTr: bestTr.properties.id,
			secondBestScore, secondBestTr: secondBestTr.properties.id,
		}, 'best score & 2nd-best score too close')
		return null
	}
	if (bestScore > 150) {
		logger.info({
			bestScore, bestTr: bestTr.properties.id,
		}, 'best score is too bad')
		return null
	}

	const _ = bestTr.properties
	const latestVehiclePos = positions[positions.length - 1]
	const runMatch = {
		vehicleId,
		score: bestScore,
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
