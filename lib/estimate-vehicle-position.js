'use strict'

const {default: nearestPointOnLine} = require('@turf/nearest-point-on-line')
const {default: length} = require('@turf/length')
const {default: along} = require('@turf/along')
const logger = require('./logger')

// todo: take individual segment speeds into account
const estimateVehiclePosition = (arrsDeps, shape, vehiclePos, tVehiclePos, tNow = Date.now()) => {
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
	const addDist = (tNow - new Date(tVehiclePos)) / dur * l

	const estDist = Math.min(l, prevDist + addDist)
	const estPosition = along(shape, estDist)
	logger.debug({
		l,
		dur,
		prevDist,
		dTime: tNow - new Date(tVehiclePos),
		addDist,
		estDist,
		estPosition,
	})
	return estPosition.geometry
}

module.exports = estimateVehiclePosition
