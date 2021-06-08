'use strict'

const {readFileSync} = require('fs')
const {join: pathJoin} = require('path')
const {Readable} = require('stream')
const {readFile} = require('fs/promises')
const GTFS_ID = require('./gtfs-id')

const dir = pathJoin(__dirname, '..', 'data', 'trajectories-' + GTFS_ID)

const readTrajectory = async (id) => {
	let data
	try {
		data = await readFile(pathJoin(dir, id + '.json'), {encoding: 'utf8'})
	} catch (err) {
		if (err.code === 'ENOENT') {
			return null // file does not exist
		}
		throw err
	}
	return JSON.parse(data)
}

const readTrajectories = (trajectoryIds) => {
	const l = trajectoryIds.length
	let i = 0;

	const readMore = async (howMany, readable) => {
		let pushed = 0
		for (; i < l; i++) {
			const tr = await readTrajectory(trajectoryIds[i])
			if (tr !== null) {
				readable.push(tr)
				if (++pushed >= howMany) break
			}
		}

		if (i >= l) {
			readable.push(null)
			return;
		}
	}

	// We only want to return an async iterable, but stream.Readable does
	// buffering for use out-of-the-box, so we use it.
	return new Readable({
		objectMode: true,
		read: function (howMany) {
			readMore(howMany, this)
			.then(err => this.destroy(err))
		},
	})
}

module.exports = readTrajectories
