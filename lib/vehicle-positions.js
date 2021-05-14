'use strict'

const WebSocket = require('ws')
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

let url = new URL('wss://portal.mhascaro.com/api/ws/plugins/telemetry')
url.searchParams.set('token', THINGSBOARD_TOKEN)
url = url.href

const pSetTimeout = (ms, timeoutErr) => {
	let cancel
	const p = new Promise((resolve, reject) => {
		const timer = setTimeout(reject, ms, timeoutErr)
		cancel = () => {
			clearTimeout(timer)
			resolve()
		}
	})
	p.cancel = cancel
	return p
}

// todo: use mqtt, support backpressure
const subscribeToVehiclePositions = () => {
	const ws = new WebSocket(url)
	ws.on('error', err => out.destroy(err))
	ws.on('message', (msg) => {
		try {
			const res = JSON.parse(msg + '')
			logger.debug({res}, 'server response')
			if (res.errorCode !== 0) {
				const err = new Error(res.errorMsg || 'unknown error')
				err.code = res.errorCode
				err.res = res
				out.destroy(err)
			} else {
				ws.emit('response', res)
			}
		} catch (err) {
			ws.close()
			out.destroy(err)
		}
	})

	const fetchDevices = async (deviceGroupId) => {
		logger.debug({deviceGroupId}, 'fetching list of devices/vehicles')
		const _cmdId = ++cmdId
		ws.send(JSON.stringify({
			entityDataCmds: [{
				cmdId: _cmdId,
				query: {
					entityFilter: {
						type: 'entityGroup',
						groupType: 'DEVICE',
						entityGroup: deviceGroupId,
					},
					pageLink: {pageSize: 100},
				},
			}],
		}))

		let deviceIds
		const timeout = pSetTimeout(5 * 1000, 'timeout waiting for list of devices/vehicles')
		const onRes = (res) => {
			if (res.cmdId !== _cmdId) return; // skip unrelated response
			deviceIds = res.data.data.map(device => device.entityId.id)
			timeout.cancel()
			ws.removeListener('response', onRes)
		}
		ws.on('response', onRes)
		await timeout
		return deviceIds
	}

	const subscribeToAll = async (deviceIds) => {
		const tsSubCmds = []
		for (const deviceId of deviceIds) {
			const subId = ++cmdId
			tsSubCmds.push({
				cmdId: subId,
				entityType: 'DEVICE',
				entityId: deviceId,
				scope: 'LATEST_TELEMETRY',
			})
			subscriptions.set(subId, deviceId)
		}
		logger.info({deviceIds}, 'subscribing to devices')
		ws.send(JSON.stringify({tsSubCmds}))

		const subscribed = new Set()
		const timeout = pSetTimeout(15 * 1000, 'timeout waiting for all device/vehicle subscriptions')
		const onRes = (res) => {
			if (!subscriptions.has(res.subscriptionId)) return; // skip unrelated response
			const deviceId = subscriptions.get(res.subscriptionId)

			subscribed.add(deviceId)
			logger.debug({
				deviceId,
				totalSubscriptions: subscribed.size,
				expectedSubscriptions: subscriptions.size,
			}, 'subscribed to device')
			if (subscribed.size === subscriptions.size) {
				timeout.cancel()
				ws.removeListener('response', onRes)
				logger.info('subscribed to all devices!')
			}
		}
		ws.on('response', onRes)
		await timeout
	}

	const out = new Readable({
		objectMode: true,
		read: () => {},
	})

	let cmdId = 0
	const subscriptions = new Map() // subscription ID -> device/vehicle ID
	const deviceStates = new Map() // device/vehicle ID -> data fields

	ws.on('response', (res) => {
		const {subscriptionId, data} = res
		if (!subscriptions.has(subscriptionId)) return; // skip unrelated response
		const deviceId = subscriptions.get(subscriptionId)

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
	})

	;(async () => {
		const openTimeout = pSetTimeout(5000, 'timeout opening WebSocket connection')
		ws.once('open', openTimeout.cancel)
		await openTimeout

		const deviceIds = await fetchDevices(THINGSBOARD_DEVICE_GROUP)
		await subscribeToAll(deviceIds)
	})()
	.catch(err => out.destroy(err))

	return out
}

module.exports = subscribeToVehiclePositions
