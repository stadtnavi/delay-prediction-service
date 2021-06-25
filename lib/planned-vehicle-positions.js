'use strict'

const {default: distance} = require('@turf/distance')
const {point} = require('@turf/helpers')
const {default: along} = require('@turf/along')
const {deepStrictEqual: eql} = require('assert')
const {DateTime} = require('luxon')
const {
	transit_realtime: {
		TripDescriptor: {ScheduleRelationship},
	},
} = require('gtfs-realtime-bindings')
const logger = require('./logger')
const tNow = require('./t-now')
const routesToBeMatched = require('./routes-to-be-matched')
const readTrajectories = require('./read-trajectories')
const {
	publishVehiclePosition,
} = require('./publish-realtime-data')

const TIMEZONE = process.env.TIMEZONE
if (!TIMEZONE) {
	console.error('Missing/empty TIMEZONE environment variable.')
	process.exit(1)
}
const LOCALE = process.env.LOCALE
if (!LOCALE) {
	console.error('Missing/empty LOCALE environment variable.')
	process.exit(1)
}

const computePositionOnTrajectory = (tr, t) => {
	const coords = tr.geometry.coordinates
	const arr0 = coords[0][3]
	const depN = coords[coords.length - 1][4]
	if (t < arr0 || t > depN) return null

	for (let i = 1, l = coords.length; i < l; i++) {
		const [lon, lat, _, arr, dep] = coords[i - 1]
		const [lon2, lat2, __, arr2, dep2] = coords[i]

		if (t >= arr && t <= dep) return [lon, lat]
		if (t >= arr2 && t <= dep2) return [lon2, lat2]

		if (t <= arr2) {
			// interpolate
			const progress = (t - dep) / (arr2 - dep)
			const dist = distance(point([lon, lat]), point([lon2, lat2]))
			const pos = along({
				type: 'Feature',
				properties: {},
				geometry: {
					type: 'LineString',
					coordinates: [[lon, lat], [lon2, lat2]]
				},
			}, dist * progress)
			return pos.geometry.coordinates
		}
	}
}

const tr1 = {
	type: 'Feature',
	properties: {},
	geometry: {
		type: 'LineString',
		coordinates: [
			[ 1, 10, null,  1000,  2000],
			[11, 20, null, 11000, 12000],
			[21, 30, null, 21000, 22000],
		],
	},
}
eql(computePositionOnTrajectory(tr1,   900), null)
eql(computePositionOnTrajectory(tr1,  1000), [1, 10])
eql(computePositionOnTrajectory(tr1,  1500), [1, 10])
eql(computePositionOnTrajectory(tr1,  2000), [1, 10])
eql(computePositionOnTrajectory(tr1,  6500).map(n => n.toFixed(3)), ['5.882', '15.055'])
eql(computePositionOnTrajectory(tr1, 11000), [11, 20])
eql(computePositionOnTrajectory(tr1, 20000).map(n => n.toFixed(3)), ['19.802', '28.925'])

const sendPlannedVehiclePositions = async (db) => {
	logger.debug('sending planned vehicle positions')

	const dt = DateTime.fromMillis(tNow(), {zone: TIMEZONE, locale: LOCALE})
	const {rows: plannedRuns} = await db.query(`
		SELECT
			route_id,
			route_short_name,
			trip_id,
			trip_headsign,
			date
		FROM current_runs($1, $2, $3, $4)
	`, [
		// yesterday & today
		dt.minus({days: 1}).toISODate(), dt.toISODate(),
		// t_arrival_min
		// The vehicle may end a "run" up to 60m behind schedule.
		dt.minus({minutes: 60}).toISO(),
		// t_arrival_max
		// The vehicle may start a "run" up to 20m ahead of schedule.
		dt.plus({minutes: 20}).toISO(),
	])

	const runsByTrajectoryId = new Map()
	const trajectoryIds = new Array(plannedRuns.length)
	for (let i = 0, l = plannedRuns.length; i < l; i++) {
		const run = plannedRuns[i]
		const date = run.date.slice(0, 4 + 1 + 2 + 1 + 2)
		const trajectoryId = run.trip_id + '-' + date

		trajectoryIds[i] = trajectoryId
		runsByTrajectoryId.set(trajectoryId, run)
	}

	const t0 = tNow()
	const vehiclePositions = []
	for await (const tr of readTrajectories(trajectoryIds)) {
		const pos = computePositionOnTrajectory(tr, Math.round(t0 / 1000))
		if (pos === null) {
			logger.trace({trajectory: tr.properties.id}, 'currently not running')
			continue
		}
		const run = runsByTrajectoryId.get(tr.properties.id)

		// build GTFS-Realtime VehiclePosition
		// https://developers.google.com/transit/gtfs-realtime/reference/#message-vehicleposition
		// todo: add a flag that this is just planned data
		const vehiclePosition = {
			timestamp: tNow() / 1000 | 0,
			trip: {
				trip_id: run.trip_id,
				route_id: run.route_id,
				// todo: start_date
				// todo: start_time
				schedule_relationship: ScheduleRelationship.SCHEDULED,
			},
			vehicle: {
				id: tr.properties.id, // trajectory ID is trip ID + date
			},
			position: {
				latitude: pos[1],
				longitude: pos[0],
				// todo: bearing
			},
			// todo: current_stop_sequence, stop_id, current_status
		}
		const additionalData = {
			route_short_name: run.route_short_name,
			trip_headsign: run.trip_headsign,
		}
		vehiclePositions.push([vehiclePosition, additionalData])
	}
	const duration = tNow() - t0

	// todo: only send them if there hasn't been a recent *predicted* pos
	await Promise.all(vehiclePositions.map(([vP, addData]) => publishVehiclePosition(vP, addData)))
}

module.exports = sendPlannedVehiclePositions
