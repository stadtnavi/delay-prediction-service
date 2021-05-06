#!/usr/bin/env node
'use strict'

const {parse} = require('ndjson')
const buffer = require('@turf/buffer')
const truncate = require('@turf/truncate').default

const TTL = process.env.TTL
	? parseInt(process.env.TTL)
	: 60 * 60 // 1h

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
		// Pass through original lon/lat by adding them as fields.
		// https://tile38.com/commands/set#fields
		// Apparently the fields `lon` & `lat` are reserved, so we picked different ones.
		'FIELD', 'lo', longitude,
		'FIELD', 'la', latitude,
		// todo: add speed as field?
		// todo: add pax as field?
		'OBJECT', JSON.stringify(shape),
	].join(' ') + '\n')
})
