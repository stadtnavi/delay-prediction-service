'use strict'

const differentialToFullDataset = require('gtfs-rt-differential-to-full-dataset')
const computeEtag = require('etag')
const serveBuffer = require('serve-buffer')
const createCors = require('cors')
const {createServer} = require('http')
const tNow = require('./t-now')
const logger = require('./logger')

const differentialToFull = differentialToFullDataset({
	ttl: 10 * 60 * 1000, // 10m
})
const putFeedEntity = (entity) => {
	differentialToFull.write(entity)
}

let feed = differentialToFull.asFeedMessage()
let timeModified = new Date(tNow())
let etag = computeEtag(feed)
// todo: debounce this
differentialToFull.on('change', () => {
	feed = differentialToFull.asFeedMessage()
	timeModified = new Date(tNow())
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
server.listen(port, (err) => {
	if (err) {
		logger.error(err)
		process.exit(1)
	} else {
		logger.info(`HTTP server listening on ${port}`)
	}
})

const close = () => {
	server.close()
}

module.exports = {
	putFeedEntity,
	close,
}
