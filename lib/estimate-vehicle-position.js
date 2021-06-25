'use strict'

const {default: nearestPointOnLine} = require('@turf/nearest-point-on-line')
const {default: length} = require('@turf/length')
const {default: along} = require('@turf/along')
const {default: bearing} = require('@turf/bearing')
const tNow = require('./t-now')
const logger = require('./logger')

// todo: take individual segment speeds into account
const estimateVehiclePosition = (arrsDeps, shape, vehiclePos, tVehiclePos) => {
	const shapePts = shape.coordinates

	const n = nearestPointOnLine(shape, vehiclePos)

	if (n.properties.dist === 0 && n.properties.index === shapePts.length - 1) {
		// vehicle was already at the end of the shape
		return vehiclePos
	}

	const l = length(shape)
	const dur = (
		Date.parse(arrsDeps[arrsDeps.length - 1].t_arrival)
		- Date.parse(arrsDeps[0].t_departure)
	)

	// note: the calculated distance along the line may not match shape_dist_traveled
	const prevDist = n.properties.location
	const addDist = (tNow() - new Date(tVehiclePos)) / dur * l

	const estDist = Math.min(l, prevDist + addDist)
	const estPosition = along(shape, estDist)
	const estBearing = bearing(estPosition, along(shape, estDist + 10))

	logger.debug({
		l,
		dur,
		prevDist,
		dTime: tNow() - new Date(tVehiclePos),
		addDist,
		estDist,
		estPosition,
		estBearing,
	})
	return {
		estimatedShapeDistance: estDist * 1000,
		estimatedPosition: estPosition.geometry,
		// GTFS-Realtime assumes degrees clockwise, Turf.js returns +-180 degrees
		estimatedBearing: estBearing < 0 ? 360 + estBearing : estBearing,
	}
}

module.exports = estimateVehiclePosition
