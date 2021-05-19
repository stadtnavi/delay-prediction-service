'use strict'

const {Transform} = require('stream')
const logger = require('./lib/logger')
const prognoseRunDelays = require('./lib/prognose-delays')
const subscribeToVehiclePositions = require('./lib/vehicle-positions')
const {runWithinTx} = require('./lib/db')

const abortWithError = (err) => {
	logger.error(err)
	process.exit(1)
}

const processVehiclePosition = async (vehiclePos) => {
	logger.debug({vehiclePos})
	if (vehiclePos.hdop < 0) console.error('weird data', vehiclePos)
	console.error('event timestamp', new Date(vehiclePos.t).toISOString(), 'event delay', (Date.now() - vehiclePos.t) / 1000, 's')

	await runWithinTx(async (db) => {
		await prognoseRunDelays(db, vehiclePos) // todo: use the result
	})
}

subscribeToVehiclePositions()
.on('error', abortWithError)
.pipe(new Transform({
	objectMode: true,
	transform: (vehiclePos, _, cb) => {
		processVehiclePosition(vehiclePos)
		.then(() => cb(), cb)
	}
}))
.on('error', abortWithError)
