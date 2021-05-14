'use strict'

const WebSocket = require('ws')
const {Readable} = require('stream')

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

// todo: use mqtt, support backpressure
const subscribeToVehiclePositions = () => {
	const ws = new WebSocket(url)
	ws.on('error', err => out.destroy(err))
	// todo: add open timeout
	ws.once('open', () => {
		ws.send(JSON.stringify({
			tsSubCmds: [{
				cmdId: 10,
				entityType: 'DEVICE',
				entityId: THINGSBOARD_DEVICE,
				scope: 'LATEST_TELEMETRY',
			}],
		}))
	})

	const out = new Readable({
		objectMode: true,
		read: () => {},
	})
	ws.on('message', (msg) => {
		try {
			const {data} = JSON.parse(msg + '')
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
		} catch (err) {
			out.destroy(err)
		}
	})

	return out
}

module.exports = subscribeToVehiclePositions
