'use strict'

const {Transform, pipeline} = require('stream')
const logger = require('./lib/logger')
const insertVehiclePosition = require('./lib/insert-vehicle-position')
const prognoseVehiclePosition = require('./lib/prognose-vehicle-position')
const prognoseTripUpdate = require('./lib/prognose-trip-update')
const subscribeToVehiclePositions = require('./lib/vehicle-positions-source')
const {runWithinTx} = require('./lib/db')
const {
	schedulePrognoseTripUpdate,
	schedulePrognoseVehiclePosition,
} = require('./lib/schedule-timer')

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
	const {vehicleId, t: tVehiclePos} = vehiclePosEv

	await insertVehiclePosition(db, vehiclePosEv)

	await Promise.all([
		prognoseTripUpdate(db, vehicleId, tVehiclePos),
		prognoseVehiclePosition(db, vehicleId, tVehiclePos),
	])
	schedulePrognoseTripUpdate(20 * 1000, vehicleId, tVehiclePos)
	schedulePrognoseVehiclePosition(10 * 1000, vehicleId, tVehiclePos)
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
