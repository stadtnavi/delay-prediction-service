'use strict'

const logger = require('./logger')
const matchVehicle = require('./match-vehicle-positions')
const fetchRun = require('./fetch-run')
const estimateVehiclePos = require('./estimate-vehicle-position')
const {publishVehiclePosition} = require('./publish-realtime-data')

// https://developers.google.com/transit/gtfs-realtime/reference/#enum-schedulerelationship
// enum ScheduleRelationship
// The relation between this StopTime and the static schedule.
// SCHEDULED – The vehicle is proceeding in accordance with its static schedule of stops, although not necessarily according to the times of the schedule. This is the default behavior. At least one of arrival and departure must be provided.
const SCHEDULED = 0

const isoToPosix = iso => Date.parse(iso) / 1000 | 0

const prognoseAndPublishVehiclePosition = async (db, vehicleId, tVehiclePos) => {
	// todo: lib/prognose-trip-update does this as well, don't do it twice
	const runMatch = await matchVehicle(db, vehicleId, tVehiclePos)
	if (!runMatch) return; // abort
	const {
		latestVehiclePos, tLatestVehiclePos, matchingConsecutiveVehiclePositions,
		trip_id, date, shape_id,
	} = runMatch

	// todo: lib/prognose-trip-update does this as well, don't do it twice
	const run = await fetchRun(db, trip_id, date)
	const {
		route_id,
		shape,
		arrivalsDepartures: arrsDeps,
	} = run

	const tripDescriptor = {
		trip_id,
		route_id,
		schedule_relationship: SCHEDULED,
	}
	const vehicleDescriptor = {
		id: vehicleId,
	}

	const tNow = Date.now()
	const estimatedVehiclePos = estimateVehiclePos(arrsDeps, shape, latestVehiclePos, tLatestVehiclePos, tNow)

	// build GTFS-Realtime VehiclePosition
	// https://developers.google.com/transit/gtfs-realtime/reference/#message-vehicleposition
	const vehiclePosition = {
		timestamp: tNow / 1000 | 0,
		trip: tripDescriptor,
		vehicle: vehicleDescriptor,
		position: {
			latitude: estimatedVehiclePos.coordinates[1],
			longitude: estimatedVehiclePos.coordinates[0],
			// todo: bearing & odometer, using run's shape
		},
		// todo: current_stop_sequence, stop_id, current_status
		// todo: congestion_level?
		// todo: occupancy_status using pax count?
	}

	await publishVehiclePosition(vehiclePosition)
}

module.exports = prognoseAndPublishVehiclePosition
