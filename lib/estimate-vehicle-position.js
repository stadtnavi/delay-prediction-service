'use strict'

const {default: nearestPointOnLine} = require('@turf/nearest-point-on-line')
const {default: length} = require('@turf/length')
const {default: along} = require('@turf/along')
const logger = require('./logger')

// todo: take individual segment speeds into account
const estimateVehiclePosition = (tr, vehiclePos, tVehiclePos, tNow = Date.now()) => {
	const n = nearestPointOnLine({
		type: 'LineString',
		coordinates: tr,
	}, {
		type: 'Point',
		coordinates: [vehiclePos.longitude, vehiclePos.latitude],
	})
	console.error('n', n)

	if (n.properties.dist === 0 && n.properties.index === tr.length - 1) {
		// vehicle was already at the end of the trajectory
		return vehiclePos
	}

	const l = length({type: 'LineString', coordinates: tr})
	const dur = tr[tr.length - 1][3] - tr[0][4]

	const prevProgress = n.properties.location
	const dProgress = (tNow - tVehiclePos) / 1000 / dur * l

	const estProgress = Math.max(l, prevProgress + dProgress)
	const estPosition = along({type: 'LineString', coordinates: tr}, estProgress)
	return {
		latitude: estPosition.geometry.coordinates[1],
		longitude: estPosition.geometry.coordinates[0],
	}
}

module.exports = estimateVehiclePosition
