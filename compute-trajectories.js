#!/usr/bin/env node
'use strict'

const {join: pathJoin} = require('path')
const readCsv = require('gtfs-utils/read-csv')
const readServices = require('gtfs-utils/read-services-and-exceptions')
const computeTrajectories = require('gtfs-utils/compute-trajectories')
const resolveTime = require('gtfs-utils/lib/resolve-time')
const {writeFile} = require('fs/promises')
const pkg = require('./package.json')

const TIMEZONE = process.env.TIMEZONE
if (!TIMEZONE) {
	console.error('Missing/empty TIMEZONE environment variable.')
	process.exit(1)
}

const src = process.env.GTFS_DIR || 'gtfs'
const readFile = async (name) => {
	return await readCsv(pathJoin(src, name + '.txt'))
}

const destDir = process.env.TRAJECTORIES_DIR || pathJoin(__dirname, 'trajectories')

const herrenberg779Bus = ['31-779-j21-2']
const herrenberg782Bus = ['31-782-j21-1']
const filters = {
	trip: t => [...herrenberg779Bus, ...herrenberg782Bus].includes(t.route_id),
}

const withAbsoluteTime = (tr, date) => {
	try {
		const withAbsTime = ([lon, lat, alt, arr, dep]) => [
			lon, lat, alt,
			resolveTime(TIMEZONE, date, arr), // arr
			resolveTime(TIMEZONE, date, dep), // dep
		]
		return {
			type: 'Feature',
			properties: {
				...tr.properties,
				id: tr.properties.tripId + '-' + date,
				date,
			},
			geometry: {
				type: 'LineString',
				coordinates: tr.geometry.coordinates.map(withAbsTime)
			},
		}
	} catch (err) {
		err.trajectory = tr
		err.date = date
		throw err
	}
}

;(async () => {
	const svcDates = new Map()
	for await (const [serviceId, dates] of readServices(readFile, TIMEZONE)) {
		svcDates.set(serviceId, dates)
	}

	const trajectories = await computeTrajectories(readFile, filters)
	for await (const tr of trajectories) {
		const {id, tripId, serviceId} = tr.properties
		if (!svcDates.has(serviceId)) {
			console.error('invalid service_id', tr.properties)
			continue
		}
		const dates = svcDates.get(serviceId)
		if (dates.length === 0) {
			console.error('0 service dates', serviceId, dates)
			continue
		}

		console.error('processing', id, 'serviceId', serviceId, 'with', dates.length, 'service dates')
		for (const date of dates) {
			const absTr = withAbsoluteTime(tr, date)

			await writeFile(
				pathJoin(destDir, absTr.properties.id + '.json'),
				JSON.stringify(absTr),
			)
		}
	}
})()
.catch((err) => {
	console.error(err)
	process.exit(1)
})
