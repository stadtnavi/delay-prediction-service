#!/usr/bin/env node
'use strict'

const {parse} = require('ndjson')

;(async () => {
	const state = Object.create(null) // vehicle ID -> {curLon, curLat, tStart, prevT}

	process.stdout.write('vehicle_id,dwelling_duration,dwelling_start,dwelling_end,lon,lat\n')
	for await (const r of process.stdin.pipe(parse())) {
		const id = r[1]
		const t = parseInt(r[0])
		const lon = Math.round(r[2] * 100) / 100
		const lat = Math.round(r[3] * 100) / 100

		const _ = (
			state[id]
			|| (state[id] = {curLon: NaN, curLat: NaN, tStart: NaN, prevT: null})
		)

		if (lon !== _.curLon || lat !== _.curLat) {
			if (_.prevT !== null) {
				const dur = _.prevT - _.tStart
				process.stdout.write(`${id},${dur},${_.tStart},${_.prevT},${_.curLon},${_.curLat}\n`)
			}
			_.tStart = t
			_.curLon = lon
			_.curLat = lat
		}
		_.prevT = t
	}
})()
.catch((err) => {
	console.error(err)
	process.exit(1)
})
