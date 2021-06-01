'use strict'

const {default: nearestPointOnLine} = require('@turf/nearest-point-on-line')
const logger = require('./logger')

const distanceAlongLine = (line, point) => {
	return nearestPointOnLine(line, point).properties.location * 1000
}

const prognoseRunDelay = async (db, run, vehicleId, latestVehiclePos, tLatestVehiclePos) => {
	// patch arrivalsDepartures[].shape_dist_traveled
	// todo: require the GTFS feed to contain shape_dist_traveled!
	const arrsDeps = run.arrivalsDepartures.map((ad) => ({
		...ad,
		shape_dist_traveled: 'number' === typeof ad.shape_dist_traveled
			? ad.shape_dist_traveled
			: distanceAlongLine(run.shape, ad.stop_loc),
	}))

	const vehicleTraveled = distanceAlongLine(run.shape, latestVehiclePos)

	const prevOrCurrentArrDep = Array.from(arrsDeps).reverse()
	.find(ad => ad.shape_dist_traveled <= vehicleTraveled)
	if (!prevOrCurrentArrDep) {
		logger.warn({
			vehicleTraveled,
		}, 'missing previous/current departure')
		// todo: what to do here? is it correct to abort here?
		return null
	}
	const prevTraveled = prevOrCurrentArrDep.shape_dist_traveled

	const currentOrNextArrDep = arrsDeps
	.find(ad => ad.shape_dist_traveled >= vehicleTraveled)
	if (!currentOrNextArrDep) {
		logger.warn({
			vehicleTraveled,
		}, 'missing current/next arrival')
		// todo: what to do here? is it correct to abort here?
		return null
	}
	const nextTraveled = currentOrNextArrDep.shape_dist_traveled

	const progressToNext = (vehicleTraveled - prevTraveled) / (nextTraveled - prevTraveled)
	logger.debug({
		latestVehiclePos,
		vehicleTraveled,
		prevOrCurrentArrDep, prevTraveled,
		currentOrNextArrDep, nextTraveled,
		progressToNext,
	})

	// We currently assume linear progress along the shape/track.
	// We also apply the delay to every future arrival/departures.
	// todo: write a smarter algorithm
	const prevDep = Date.parse(prevOrCurrentArrDep.t_departure)
	const nextArr = Date.parse(currentOrNextArrDep.t_arrival)
	const plannedTimeAtVehiclePos = Math.round(prevDep + progressToNext * (nextArr - prevDep))
	const actualTimeAtVehiclePos = Date.parse(tLatestVehiclePos)
	const delay = (actualTimeAtVehiclePos - plannedTimeAtVehiclePos) / 1000 | 0
	logger.info({
		vehicleId,
		prevDep, nextArr,
		plannedTimeAtVehiclePos,
		actualTimeAtVehiclePos,
		delay,
	})

	return {
		plannedTimeAtVehiclePos, actualTimeAtVehiclePos, delay,
		prevOrCurrentArrDep, currentOrNextArrDep,
	}
}

module.exports = prognoseRunDelay
