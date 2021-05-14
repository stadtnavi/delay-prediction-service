'use strict'

const WebSocket = require('ws')
const {Readable} = require('stream')
const logger = require('./logger')

const THINGSBOARD_TOKEN = process.env.THINGSBOARD_TOKEN
if (!THINGSBOARD_TOKEN) {
	console.error('Missing/empty THINGSBOARD_TOKEN environment variable.')
	process.exit(1)
}

// todo: subscribe to all
const THINGSBOARD_DEVICE = process.env.THINGSBOARD_DEVICE
if (!THINGSBOARD_DEVICE) {
	console.error('Missing/empty THINGSBOARD_DEVICE environment variable.')
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

	const out = new Readable({
		objectMode: true,
		read: () => {},
	})

	let cmdId = 0

	ws.on('response', (res) => {
		const {data} = res
		// todo: validate `data`
		if (data) {
			out.push({
				vehicleId: THINGSBOARD_DEVICE, // todo
				hdop: parseFloat(data.hdop[0][1]),
				latitude: parseFloat(data.latitude[0][1]),
				longitude: parseFloat(data.longitude[0][1]),
				t: Math.min( // pick oldest
					data.hdop[0][0],
					data.latitude[0][0],
					data.longitude[0][0],
				),
			})
		}
	})

	;(async () => {
		const openTimeout = pSetTimeout(5000, 'timeout opening WebSocket connection')
		ws.once('open', openTimeout.cancel)
		await openTimeout

		ws.send(JSON.stringify({
			tsSubCmds: [{
				cmdId: ++cmdId,
				entityType: 'DEVICE',
				entityId: THINGSBOARD_DEVICE,
				scope: 'LATEST_TELEMETRY',
			}],
		}))

		const timeout = pSetTimeout(15 * 1000, 'timeout waiting for all device/vehicle subscriptions')
		const onRes = (res) => {
			timeout.cancel()
			ws.removeListener('response', onRes)
			logger.info('subscribed to device!')
		}
		ws.on('response', onRes)
		await timeout
	})()
	.catch(err => out.destroy(err))

	return out
}

module.exports = subscribeToVehiclePositions
