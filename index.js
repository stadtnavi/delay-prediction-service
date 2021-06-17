'use strict'

const {Writable, pipeline} = require('stream')
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
