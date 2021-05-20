'use strict'

const {Transform} = require('stream')
const logger = require('./lib/logger')
const insertVehiclePosition = require('./lib/insert-vehicle-position')
const prognoseRunDelays = require('./lib/prognose-delays')
const subscribeToVehiclePositions = require('./lib/vehicle-positions')
const {runWithinTx} = require('./lib/db')

const abortWithError = (err) => {
	logger.error(err)
	process.exit(1)
}

const processVehiclePosition = async (db, vehiclePos) => {
	if (vehiclePos.hdop < 0) {
		// todo: find the root cause
		logger.warn(vehiclePos, 'ignoring vehicle position because of weird hdop')
		return;
	}

	await insertVehiclePosition(db, vehiclePos)
	await prognoseRunDelays(db, vehiclePos) // todo: use the result
}

// subscribeToVehiclePositions()
process.stdin.on('error', abortWithError).pipe(require('ndjson').parse())
.on('error', abortWithError)
.pipe(new Transform({
	objectMode: true,
	transform: (vehiclePos, _, cb) => {
		runWithinTx(async (db) => {
			await processVehiclePosition(db, vehiclePos)
		})
		.then(() => cb(), cb)
	}
}))
.on('error', abortWithError)
