'use strict'

const {Writable, pipeline} = require('stream')
const logger = require('./lib/logger')
const insertVehiclePosition = require('./lib/insert-vehicle-position')
const isWithinBusDepot = require('./lib/is-within-bus-depot')
const prognoseVehiclePosition = require('./lib/prognose-vehicle-position')
const prognoseTripUpdate = require('./lib/prognose-trip-update')
const subscribeToVehiclePositions = require('./lib/vehicle-positions-source')
const {runWithinTx} = require('./lib/db')
const {
	schedulePrognoseTripUpdate,
	schedulePrognoseVehiclePosition,
} = require('./lib/schedule-timer')
const sendPlannedVehiclePositions = require('./lib/planned-vehicle-positions')

const SEND_PLANNED_VEHICLE_POSITIONS = process.env.SEND_PLANNED_VEHICLE_POSITIONS !== 'false'

const processVehiclePosition = async (db, vehiclePosEv) => {
	if (vehiclePosEv.hdop < 0) {
		// todo: find the root cause
		logger.warn(vehiclePosEv, 'ignoring vehicle position because of weird hdop')
		return;
	}
	const {vehicleId, t: tVehiclePos} = vehiclePosEv

	await insertVehiclePosition(db, vehiclePosEv)

	// We keep track of dwelling in the bus depot, but we don't want to act on
	// it in any way.
	if (isWithinBusDepot(vehiclePosEv)) return; // abort

	await Promise.all([
		prognoseTripUpdate(db, vehicleId, tVehiclePos),
		prognoseVehiclePosition(db, vehicleId, tVehiclePos),
	])
	schedulePrognoseTripUpdate(10 * 1000, vehicleId, tVehiclePos)
	schedulePrognoseVehiclePosition(5 * 1000, vehicleId, tVehiclePos)
}

if (SEND_PLANNED_VEHICLE_POSITIONS) {
	// In some cases, we can't publish predicted vehicle positions (or trip updates,
	// for that matter), but we send vehicle positions according to the schedule.
	// todo: indicate that they are not reliable, e.g. using a MQTT topic flag or proprietary msg field
	const periodicallySendPlannedVehiclePositions = () => {
		runWithinTx(db => sendPlannedVehiclePositions(db))
		.catch((err) => {
			logger.error(err, 'failed to send planned vehicle positions')
		})
		.then(() => {
			setTimeout(periodicallySendPlannedVehiclePositions, 10 * 1000)
		})
	}
	setTimeout(periodicallySendPlannedVehiclePositions, 10 * 1000)
}

pipeline(
	subscribeToVehiclePositions(),

	new Writable({
		objectMode: true,
		highWaterMark: 1,
		write: (vehiclePos, _, cb) => {
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
