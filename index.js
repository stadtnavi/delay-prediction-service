'use strict'

const {Transform, pipeline} = require('stream')
const logger = require('./lib/logger')
const insertVehiclePosition = require('./lib/insert-vehicle-position')
const matchVehicle = require('./lib/match-vehicle-positions')
const fetchRun = require('./lib/fetch-run')
const prognoseRunDelay = require('./lib/prognose-run-delay')
const subscribeToVehiclePositions = require('./lib/vehicle-positions-source')
const {runWithinTx} = require('./lib/db')
const estimateVehiclePos = require('./lib/estimate-vehicle-position')
const {
	publishTripUpdate,
	publishVehiclePosition,
} = require('./lib/publish-realtime-data')

// https://developers.google.com/transit/gtfs-realtime/reference/#enum-schedulerelationship
// enum ScheduleRelationship
// The relation between this StopTime and the static schedule.
// SCHEDULED – The vehicle is proceeding in accordance with its static schedule of stops, although not necessarily according to the times of the schedule. This is the default behavior. At least one of arrival and departure must be provided.
const SCHEDULED = 0

const isoToPosix = iso => Date.parse(iso) / 1000 | 0

const processVehiclePosition = async (db, vehiclePosEv) => {
	if (vehiclePosEv.hdop < 0) {
		// todo: find the root cause
		logger.warn(vehiclePosEv, 'ignoring vehicle position because of weird hdop')
		return;
	}
	const {vehicleId} = vehiclePosEv

	await insertVehiclePosition(db, vehiclePosEv)
	const runMatch = await matchVehicle(db, vehicleId, vehiclePosEv.t)
	if (!runMatch) return; // abort
	const {
		latestVehiclePos, tLatestVehiclePos, matchingConsecutiveVehiclePositions,
		trip_id, date, shape_id,
	} = runMatch

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

	await publishTripUpdate(tripUpdate)
	await publishVehiclePosition(vehiclePosition)
}

pipeline(
	// todo
	// subscribeToVehiclePositions(),
	process.stdin, require('ndjson').parse(),

	new Transform({
		objectMode: true,
		transform: (vehiclePos, _, cb) => {
			runWithinTx(db => processVehiclePosition(db, vehiclePos))
			.then(() => cb(), cb)
		},
	}),

	(err) => {
		if (err) {
			logger.error(err)
			process.exit(1)
		}
	},
)
