'use strict'

const {default: distance} = require('@turf/distance')
const matchPointsWithShape = require('gtfs-utils/lib/match-points-with-shape')
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
	logger.debug(_positions.length, 'pos', positions.length, 'pos after truncating', 'trajectory', tr.properties.id)
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
	return (
		(200 + score)
		/ matchedPositions
		/ Math.sqrt(matchedPositions)
		* (matchedPositions / positions.length)
	)
}

module.exports = matchVehiclePositionsWithTrajectory
