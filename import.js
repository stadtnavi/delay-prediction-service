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
    import.js <path-to-trips-file> <path-to-shapes-file>
\n`)
	process.exit(0)
}

const {join: pathJoin} = require('path')
const Redis = require('ioredis')
const readCsv = require('gtfs-utils/read-csv')
const {writeFile} = require('fs/promises')
const extractGtfsShapes = require('extract-gtfs-shapes')

const showError = (err) => {
	console.error(err)
	process.exit(1)
}

const pathToTripsFile = argv._[0]
if (!pathToTripsFile) {
	showError('Missing path-to-trips-file parameter.')
}
const pathToShapesFile = argv._[1]
if (!pathToShapesFile) {
	showError('Missing path-to-shapes-file parameter.')
}
const shapesFile = pathToShapesFile === '-'
	? process.stdin
	: pathToShapesFile

;(async () => {
	console.info('building map: shape_id -> trip_id, trip_id -> route_id')

	const tripIdsByShapeId = Object.create(null)
	for await (const t of readCsv(pathToTripsFile)) {
		if (!t.shape_id) {
			console.warn('trip has no shape_id, skipping', t)
			continue
		}
		if (t.shape_id in tripIdsByShapeId) tripIdsByShapeId[t.shape_id].push(t.trip_id)
		else tripIdsByShapeId[t.shape_id] = [t.trip_id]
	}
	await writeFile(
		pathJoin(__dirname, 'trip-ids-by-shape-id.json'),
		JSON.stringify(tripIdsByShapeId),
	)


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
