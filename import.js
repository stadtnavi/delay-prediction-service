#!/usr/bin/env node
'use strict'

const mri = require('mri')

const argv = mri(process.argv.slice(2), {
	boolean: [
		'help', 'h',
		'version', 'v'
	]
})

if (argv.help || argv.h) {
	process.stdout.write(`
Usage:
    import.js <path-to-shapes-file>
\n`)
	process.exit(0)
}

const {join: pathJoin} = require('path')
const Redis = require('ioredis')
const extractGtfsShapes = require('extract-gtfs-shapes')

const showError = (err) => {
	console.error(err)
	process.exit(1)
}

const pathToShapesFile = argv._[0]
if (!pathToShapesFile) {
	showError('Missing path-to-shapes-file parameter.')
}
const shapesFile = pathToShapesFile === '-'
	? process.stdin
	: pathToShapesFile

;(async () => {
	console.info('creating a Tile38 geofence channel for each shape')

	const tile38 = new Redis(process.env.TILE38_URL || 'redis://localhost:9851/')
	tile38.setchan = tile38.createBuiltinCommand('setchan').string

	const onShape = async (shapeId, points) => {
		const shape = {
			type: 'LineString',
			coordinates: points.map(p => [
				// points is lon/lat
				parseFloat(p[0]),
				parseFloat(p[1]),
			]),
		}

		const channelId = shapeId
		await tile38.setchan(
			channelId,
			// only intersections with `buses` collection
			'INTERSECTS', 'buses',
			// observe entering, moving inside & exiting a route shape
			'FENCE',
			'DETECT', 'enter,inside,exit', // todo: cross?
			'COMMANDS', 'set', // only notify for SET in `buses` (a.k.a updated bus positions)
			// define route shape via GeoJSON string
			'OBJECT', JSON.stringify(shape),
		)
		console.debug(`created "${channelId}"`)
	}
	await extractGtfsShapes(shapesFile, onShape, {
		formatShape: (shapeId, points) => points,
	})

	tile38.quit()
})()
.catch(showError)
