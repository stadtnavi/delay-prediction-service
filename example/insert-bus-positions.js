#!/usr/bin/env node
'use strict'

const {parse} = require('ndjson')
const buffer = require('@turf/buffer')
const truncate = require('@turf/truncate').default

const showError = (err) => {
	console.error(err)
	process.exit(1)
}

process.stdin
.once('error', showError)
.pipe(parse())
.once('error', showError)
.on('data', ([vehicleId, longitude, latitude]) => {
	// todo: probably there's a way to let Tile38 compute the circle
	let shape = buffer({
		type: 'Point',
		coordinates: [longitude, latitude],
	}, .05, {units: 'kilometers'}) // 50m
	shape = truncate(shape, {precision: 5}).geometry

	process.stdout.write([
		'SET', 'buses', vehicleId,
		'OBJECT', JSON.stringify(shape),
	].join(' ') + '\n')
})
