'use strict'

const differentialToFullDataset = require('gtfs-rt-differential-to-full-dataset')
const computeEtag = require('etag')
const serveBuffer = require('serve-buffer')
const createCors = require('cors')
const {createServer} = require('http')
const logger = require('./logger')

const onError = (err) => {
	if (!err) return;
	logger.error(err)
	process.exit(1)
}

const differentialToFull = differentialToFullDataset({
	ttl: 10 * 60 * 1000, // 10m
})

let entityId = 0
const putTripUpdate = (tU) => {
	differentialToFull.write({
		id: (entityId++) + '',
		trip_update: tU,
	})
}
const putVehiclePosition = (vP) => {
	differentialToFull.write({
		id: (entityId++) + '',
		vehicle: vP,
	})
}

let feed = Buffer.alloc(0)
let timeModified = new Date()
let etag = computeEtag(feed)
// todo: debounce this
differentialToFull.on('change', () => {
	feed = differentialToFull.asFeedMessage()
	timeModified = new Date()
	etag = computeEtag(feed)
})

const onRequest = (req, res) => {
	const path = new URL(req.url, 'http://localhost').pathname
	if (path === '/') {
		serveBuffer(req, res, feed, {
			timeModified, etag,
		})
	} else {
		res.statusCode = 404
		res.end('not found')
	}
}

const cors = createCors()
const server = createServer((req, res) => {
	cors(req, res, (err) => {
		if (err) {
			res.statusCode = err.statusCode || 500
			res.end(err + '')
		} else {
			onRequest(req, res)
		}
	})
})

const port = parseInt(process.env.PORT || 3000)
server.listen(port, onError)

const close = () => {
	server.close()
}

module.exports = {
	putTripUpdate,
	putVehiclePosition,
	close,
}
