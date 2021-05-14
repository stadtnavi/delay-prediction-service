'use strict'

const {Transform} = require('stream')
const {DateTime} = require('luxon')
const logger = require('./lib/logger')
const subscribeToVehiclePositions = require('./lib/vehicle-positions')
const {runWithinTx} = require('./lib/db')

const TIMEZONE = process.env.TIMEZONE
if (!TIMEZONE) {
	console.error('Missing/empty TIMEZONE environment variable.')
	process.exit(1)
}
const LOCALE = process.env.LOCALE
if (!LOCALE) {
	console.error('Missing/empty LOCALE environment variable.')
	process.exit(1)
}

const abortWithError = (err) => {
	logger.error(err)
	process.exit(1)
}

const processVehiclePosition = async (db, vehiclePos) => {
	logger.debug({vehiclePos})
	const {vehicleId, latitude, longitude, hdop, t} = vehiclePos

	const dt = DateTime.fromMillis(t, {zone: TIMEZONE, locale: LOCALE})
	await db.query(`
		INSERT INTO vehicle_positions (vehicle_id, location, hdop, t)
		VALUES ($1, $2, $3, $4)
	`, [
		vehicleId,
		`POINT(${longitude} ${latitude})`,
		hdop,
		dt.toISO(),
	])

	// todo
}

subscribeToVehiclePositions()
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
