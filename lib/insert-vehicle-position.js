'use strict'

const {DateTime} = require('luxon')
const logger = require('./logger')

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

const insertVehiclePosition = async (db, vehiclePos) => {
	const {vehicleId, longitude, latitude, hdop, pax, t} = vehiclePos
	const dt = DateTime.fromMillis(t, {zone: TIMEZONE, locale: LOCALE})

	logger.debug({
		vehicleId,
		longitude,
		latitude,
		pax,
		hdop,
		t: dt.toISO(),
	}, 'inserting vehicle position')
	await db.query(`
		INSERT INTO vehicle_positions (vehicle_id, location, hdop, pax, t)
		VALUES ($1, $2, $3, $4, $5)
		ON CONFLICT ON CONSTRAINT vehicle_positions_unique DO UPDATE SET
			location = EXCLUDED.location,
			hdop = EXCLUDED.hdop,
			pax = EXCLUDED.pax;
	`, [
		vehicleId,
		`POINT(${longitude} ${latitude})`,
		hdop,
		pax,
		dt.toISO(),
	])
}

module.exports = insertVehiclePosition
