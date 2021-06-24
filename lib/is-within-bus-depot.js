'use strict'

const {default: pointWithinPolygon} = require('@turf/boolean-point-in-polygon')
const {point} = require('@turf/helpers')

const deckenpfronnBusDepot = {
	type: 'Feature',
	properties: {},
	geometry: {
		type: 'Polygon',
		coordinates: [[
			[8.81619, 48.64924],
			[8.81641, 48.64819],
			[8.81835, 48.64837],
			[8.81808, 48.64941],
			[8.81619, 48.64924],
		]],
	},
}

const isWithinBusDepot = (vehiclePos) => {
	return pointWithinPolygon(
		point([vehiclePos.longitude, vehiclePos.latitude]),
		deckenpfronnBusDepot,
	)
}

module.exports = isWithinBusDepot
