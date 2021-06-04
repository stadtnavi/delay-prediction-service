'use strict'

const {add: arrAdd, remove: arrRemove} = require('sorted-array-functions')
const logger = require('./logger')
const prognoseVehiclePosition = require('./prognose-vehicle-position')
const prognoseTripUpdate = require('./prognose-trip-update')
const {runWithinTx} = require('./db')

// todo: persist timers across crashes
// todo: cancel all on process.on('exit')?
const allTimers = new Map() // bucket -> [t]

const idempotentScheduleTimer = (ms, bucket, fn) => {
	let timers = []
	if (allTimers.has(bucket)) timers = allTimers.get(bucket)
	else allTimers.set(bucket, timers)

	const t = Date.now() + ms
	const coalesceWithin = 100 + Math.ceil(ms / 2)
	const equivalent = timers.find((t2) => Math.abs(t - t2) <= coalesceWithin)
	if (equivalent) return; // equivalent timer already scheduled, abort here

	setTimeout(() => {
		arrRemove(timers, t)

		try {
			const p = fn()
			if (p && p.catch) {
				p.catch((err) => {
					logger.error(err, err.message || (err + ''))
				})
			}
		} catch (err) {
			logger.error(err, err.message || (err + ''))
		}
	}, ms)
	arrAdd(timers, t)
}

const schedulePrognoseVehiclePosition = (ms, vehicleId, tVehiclePos) => {
	const onPrognoseVehiclePositionTimer = async () => {
		logger.debug({vehicleId, tVehiclePos}, 'prognoseVehiclePosition timer firing')
		try {
			await runWithinTx(db => prognoseVehiclePosition(db, vehicleId, tVehiclePos))
		} finally {
			// re-schedule self
			schedulePrognoseVehiclePosition(ms, vehicleId, tVehiclePos)
		}
	}
	const bucket = 'prognoseVehiclePosition-' + vehicleId
	idempotentScheduleTimer(ms, bucket, onPrognoseVehiclePositionTimer)
}

const schedulePrognoseTripUpdate = (ms, vehicleId, tVehiclePos) => {
	const onPrognoseTripUpdateTimer = async () => {
		logger.debug({vehicleId, tVehiclePos}, 'prognoseTripUpdate timer firing')
		try {
			await runWithinTx(db => prognoseTripUpdate(db, vehicleId, tVehiclePos))
		} finally {
			// re-schedule self
			schedulePrognoseTripUpdate(ms, vehicleId, tVehiclePos)
		}
	}
	const bucket = 'prognoseTripUpdate-' + vehicleId
	idempotentScheduleTimer(ms, bucket, onPrognoseTripUpdateTimer)
}

module.exports = {
	schedulePrognoseVehiclePosition,
	schedulePrognoseTripUpdate,
}
