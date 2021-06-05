'use strict'

const {connect, fetchDevices, subscribeToTimeseries} = require('thingsboard-telemetry-stream')
const {Readable} = require('stream')
const logger = require('./logger')

const THINGSBOARD_TOKEN = process.env.THINGSBOARD_TOKEN
if (!THINGSBOARD_TOKEN) {
	console.error('Missing/empty THINGSBOARD_TOKEN environment variable.')
	process.exit(1)
}

const THINGSBOARD_DEVICE_GROUP = process.env.THINGSBOARD_DEVICE_GROUP
if (!THINGSBOARD_DEVICE_GROUP) {
	console.error('Missing/empty THINGSBOARD_DEVICE_GROUP environment variable.')
	process.exit(1)
}

// todo: use mqtt, support backpressure
const subscribeToVehiclePositions = () => {
	const out = new Readable({
		objectMode: true,
		read: () => {},
	})

	const deviceStates = new Map() // device/vehicle ID -> data fields

	const onData = (deviceId, data) => {
		const updatedFields = Object.keys(data)
		const relevantFields = ['latitude', 'longitude', 'altitude']
		if (!relevantFields.some(f => updatedFields.includes(f))) return;

		// todo: validate `data`
		const state = {
			...(deviceStates.get(deviceId) || {}),
			...data,
		}
		state.t = Math.min( // pick oldest
			state.hdop[0][0],
			state.latitude[0][0],
			state.longitude[0][0],
		)

		deviceStates.set(deviceId, state)
		out.push({
			vehicleId: deviceId,
			hdop: parseFloat(state.hdop[0][1]),
			latitude: parseFloat(state.latitude[0][1]),
			longitude: parseFloat(state.longitude[0][1]),
			t: Math.min( // pick oldest
				state.hdop[0][0],
				state.latitude[0][0],
				state.longitude[0][0],
			),
		})
	}

	;(async () => {
		const connection = await connect({
			host: 'portal.mhascaro.com',
			token: THINGSBOARD_TOKEN,
		})
		connection.addEventListener('error', err => out.destroy(err))

		const devices = await fetchDevices(connection, THINGSBOARD_DEVICE_GROUP)
		const deviceIds = devices.map(d => d.entityId.id)

		const subs = await subscribeToTimeseries(connection, deviceIds)
		subs.on('data', onData)
	})()
	.catch(err => out.destroy(err))

	return out
}

module.exports = subscribeToVehiclePositions
