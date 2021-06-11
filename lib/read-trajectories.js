'use strict'

const {readFileSync} = require('fs')
const {join: pathJoin} = require('path')
const {readFile} = require('fs/promises')
const GTFS_ID = require('./gtfs-id')

const dir = process.env.TRAJECTORIES_DIR || pathJoin(__dirname, '..', 'data', 'trajectories-' + GTFS_ID)

// Note: We assume that the set of trajectory files does *not* change at runtime.
const missing = new Set()

const readTrajectory = async (id) => {
	if (missing.has(id)) return null
	let data
	try {
		data = await readFile(pathJoin(dir, id + '.json'), {encoding: 'utf8'})
	} catch (err) {
		if (err.code === 'ENOENT') {
			missing.add(id)
			return null // file does not exist
		}
		throw err
	}
	return JSON.parse(data)
}

// todo: use stream.Readable for "buffering"?
const readTrajectories = async function* (trajectoryIds) {
	for (const id of trajectoryIds) {
		const tr = await readTrajectory(id)
		if (tr !== null) yield tr
	}
}

module.exports = readTrajectories
