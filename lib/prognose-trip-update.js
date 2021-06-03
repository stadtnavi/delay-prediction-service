'use strict'

const logger = require('./logger')
const matchVehicle = require('./match-vehicle-positions')
const fetchRun = require('./fetch-run')
const prognoseRunDelay = require('./prognose-run-delay')
const {publishTripUpdate} = require('./publish-realtime-data')

// https://developers.google.com/transit/gtfs-realtime/reference/#enum-schedulerelationship
// enum ScheduleRelationship
// The relation between this StopTime and the static schedule.
// SCHEDULED – The vehicle is proceeding in accordance with its static schedule of stops, although not necessarily according to the times of the schedule. This is the default behavior. At least one of arrival and departure must be provided.
const SCHEDULED = 0

const isoToPosix = iso => Date.parse(iso) / 1000 | 0

const prognoseAndPublishTripUpdate = async (db, vehicleId, tVehiclePos) => {
	// todo: lib/prognose-vehicle-position does this as well, don't do it twice
	const runMatch = await matchVehicle(db, vehicleId, tVehiclePos)
	if (!runMatch) return; // abort
	const {
		latestVehiclePos, tLatestVehiclePos, matchingConsecutiveVehiclePositions,
		trip_id, date, shape_id,
	} = runMatch

	// todo: lib/prognose-vehicle-position does this as well, don't do it twice
	const run = await fetchRun(db, trip_id, date)
	const {
		route_id,
		shape,
		arrivalsDepartures: arrsDeps,
	} = run

	const {
		delay,
		prevOrCurrentArrDep, currentOrNextArrDep,
	} = await prognoseRunDelay(
		db,
		run,
		vehicleId, latestVehiclePos, tLatestVehiclePos,
	)
	if (delay === null) {
		logger.warn({run, delay}, 'unknown delay, aborting')
		return; // abort
	}

	const tripDescriptor = {
		trip_id,
		route_id,
		schedule_relationship: SCHEDULED,
	}
	const vehicleDescriptor = {
		id: vehicleId,
	}

	// build GTFS-Realtime TripUpdate
	// https://developers.google.com/transit/gtfs-realtime/reference/#message-tripupdate
	const tripUpdate = {
		timestamp: isoToPosix(tLatestVehiclePos),
		trip: tripDescriptor,
		vehicle: vehicleDescriptor,
		// delay,
		stop_time_update: arrsDeps.map((ad) => {
			// don't add delays to past arrivals/departures
			const withDelay = ad.stop_sequence >= prevOrCurrentArrDep.stop_sequence
			return {
				stop_sequence: ad.stop_sequence,
				stop_id: ad.stop_id,
				arrival: ad.t_arrival ? {
					time: isoToPosix(ad.t_arrival) + (withDelay ? delay : 0),
					delay: withDelay ? delay : null,
					// todo: add uncertainty
				} : {time: null},
				departure: ad.t_departure ? {
					time: isoToPosix(ad.t_departure) + (withDelay ? delay : 0),
					delay: withDelay ? delay : null,
					// todo: add uncertainty
				} : {time: null},
				schedule_relationship: SCHEDULED,
			}
		}),
	}
	logger.debug({tripUpdate}, 'built GTFS-Realtime TripUpdate')

	await publishTripUpdate(tripUpdate)
}

module.exports = prognoseAndPublishTripUpdate
