'use strict'

const {default: distance} = require('@turf/distance')
const matchPointsWithShape = require('gtfs-utils/lib/match-points-with-shape')
const logger = require('./logger')
const {removePositionsBeforeDwelling} = require('./detect-dwelling')

const interpolateArrDep = (lower, upper, target) => {
	const fromDep = lower[4]
	const toArr = upper[3]
	const dTime = toArr - fromDep

	const lowerToTarget = distance(lower, target)
	const targetToUpper = distance(target, upper)
	const progress = lowerToTarget / (lowerToTarget + targetToUpper)

	target[3] = target[4] = Math.round(toArr + progress * dTime)
}

const matchVehiclePositionsWithTrajectory = (_positions, tr) => {
	const positions = removePositionsBeforeDwelling(_positions, tr)
	if (positions.length !== _positions.length) {
		logger.trace({
			tr: tr.properties.id,
			nrOfPositionsBefore: _positions.length,
			nrOfPositionsAfter: positions.length
		}, 'truncated positions')
	}
	let sumPosScores = 0
	let matchedPositions = 0

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
		const posScore = distanceInKm * 1000 + dTimeInS / 10
		logger.trace({
			tr: tr.properties.id, positionsI,
			position: [position.longitude, position.latitude, position.t],
			shapePt, posScore, distanceInKm, dTimeInS,
		}, 'comparing position with trajectory')
		sumPosScores += posScore
		matchedPositions++
	}
	if (matchedPositions === 0) {
		logger.trace({tr: tr.properties.id}, 'no matched positions')
		return Infinity
	}

	// mean score across all matched positions, with additive smoothing
	const smoothedMeanPosScore = (200 + sumPosScores) / matchedPositions
	// reduce score for trajectories with more matched positions, but not linearly
	const boostManyMatched = 1 / Math.sqrt(matchedPositions)
	// increase score for trajectories with few matched positions
	const boostRatioMatched = 1 / Math.pow(matchedPositions / positions.length, 2)

	const score = (
		smoothedMeanPosScore
		* boostManyMatched
		* boostRatioMatched
	)
	logger.trace({
		tr: tr.properties.id,
		sumPosScores, matchedPositions, nrOfPositions: positions.length,
		smoothedMeanPosScore, boostManyMatched, boostRatioMatched,
		score,
	}, 'computing score')
	return score
}

module.exports = matchVehiclePositionsWithTrajectory
