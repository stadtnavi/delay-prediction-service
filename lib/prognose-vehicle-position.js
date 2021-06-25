'use strict'

const {DateTime} = require('luxon')
const {
	transit_realtime: {
		VehiclePosition: {OccupancyStatus, VehicleStopStatus},
		TripDescriptor: {ScheduleRelationship},
	},
} = require('gtfs-realtime-bindings')
const logger = require('./logger')
const tNow = require('./t-now')
const matchVehicle = require('./match-vehicle-positions')
const fetchRun = require('./fetch-run')
const estimateVehiclePos = require('./estimate-vehicle-position')
const {
	publishRawVehiclePosition,
	publishVehiclePosition,
} = require('./publish-realtime-data')
const {trackRunPrognosis} = require('./recently-prognosed-runs')

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

// https://github.com/stadtnavi/thingsboard-to-gtfsrt-mqtt/blob/abfbca97df0bcaa1c14a89cbe9dbdebcde7b3816/thingsboard-to-gtfsrt-mqtt.py#L150-L157
const paxToOccupancyStatus = (pax) => {
	if ('number' !== typeof pax) return null
	const ratioFull = pax / 60
	if (ratioFull < .5) return OccupancyStatus.MANY_SEATS_AVAILABLE
	if (ratioFull < .85) return OccupancyStatus.FEW_SEATS_AVAILABLE
	return OccupancyStatus.STANDING_ROOM_ONLY
}

const prognoseAndPublishVehiclePosition = async (db, vehicleId, tVehiclePos) => {
	// Until the matching & prognosis logic in delay-prediction-service works
	// as expected, we also publish the latest raw vehicle position.
	// todo: remove this once delay-prediction-service works reasonably well
	const {rows: [{longitude, latitude}]} = await db.query(`
		SELECT
			ST_X(location::geometry) AS longitude,
			ST_Y(location::geometry) AS latitude
		FROM vehicle_positions
		WHERE vehicle_id = $1
		ORDER BY t DESC
		LIMIT 1
	`, [vehicleId])
	await publishRawVehiclePosition({
		timestamp: tVehiclePos / 1000 | 0,
		trip: {trip_id: '?'},
		// We need to pass a custom vehicle ID here, otherwise this VehiclePosition would
		// replace the one with a matched run & prognosed position.
		vehicle: {id: vehicleId},
		position: {latitude, longitude},
	})

	// todo: lib/prognose-trip-update does this as well, don't do it twice
	const runMatch = await matchVehicle(db, vehicleId, tVehiclePos)
	if (!runMatch) return; // abort
	const {
		latestVehiclePos, latestVehiclePax, tLatestVehiclePos,
		matchingConsecutiveVehiclePositions,
		route_id, route_short_name,
		trip_id, trip_headsign, date,
		shape_id,
	} = runMatch

	// todo: lib/prognose-trip-update does this as well, don't do it twice
	const run = await fetchRun(db, trip_id, date)
	const {
		shape,
		arrivalsDepartures: arrsDeps,
	} = run

	const dep0 = DateTime.fromISO(arrsDeps[0].t_departure, {
		zone: TIMEZONE, setZone: true,
		locale: LOCALE,
	})

	const tripDescriptor = {
		trip_id,
		route_id,
		start_date: dep0.toFormat('yyyyMMdd'),
		start_time: dep0.toFormat('HH:mm:ss'),
		schedule_relationship: ScheduleRelationship.SCHEDULED,
	}
	const vehicleDescriptor = {
		id: vehicleId,
	}

	const {
		estimatedShapeDistance: estimatedVehicleShapeDist,
		estimatedPosition: estimatedVehiclePos,
		estimatedBearing: estimatedVehicleBearing,
	} = estimateVehiclePos(arrsDeps, shape, latestVehiclePos, tLatestVehiclePos, tNow())

	const currentOrNextArrDep = arrsDeps
	// add buffer to cover stopped-at-stop case
	.find(ad => ad.shape_dist_traveled >= estimatedVehicleShapeDist - 50)
	if (!currentOrNextArrDep) {
		logger.warn({tLatestVehiclePos}, 'missing current/next arrival')
	}

	// build GTFS-Realtime VehiclePosition
	// https://developers.google.com/transit/gtfs-realtime/reference/#message-vehicleposition
	const vehiclePosition = {
		timestamp: tNow() / 1000 | 0,
		trip: tripDescriptor,
		vehicle: vehicleDescriptor,
		position: {
			latitude: estimatedVehiclePos.coordinates[1],
			longitude: estimatedVehiclePos.coordinates[0],
			// bearing – This should not be deduced from the sequence of previous positions, which clients can compute from previous data.
			// https://developers.google.com/transit/gtfs-realtime/reference/#message-position
			// Not sure if we're violating the spec here: We compute it based on the estimated
			// position on a shape, not based on the past positions *directly*.
			bearing: estimatedVehicleBearing,
		},
		current_stop_sequence: currentOrNextArrDep ? currentOrNextArrDep.stop_sequence : null,
		stop_id: currentOrNextArrDep ? currentOrNextArrDep.stop_id : null,
		current_status: currentOrNextArrDep ? (
			// todo: INCOMING_AT?
			Math.abs(currentOrNextArrDep.shape_dist_traveled - estimatedVehicleShapeDist) <= 50
				? VehicleStopStatus.STOPPED_AT
				: VehicleStopStatus.IN_TRANSIT_TO
		) : null,
		// todo: congestion_level?
		occupancy_status: paxToOccupancyStatus(latestVehiclePax),
	}

	const additionalData = {
		// The VehiclePosition contains the time of prediction, the metadata
		// will contain the timestamp of the latest vehicle position. We decided
		// to implement it this way in order to only have standard GTFS-Realtime
		// fields. see also https://github.com/google/transit/pull/250
		timestamp: tLatestVehiclePos,
		route_short_name,
		trip_headsign,
	}
	await publishVehiclePosition(vehiclePosition, additionalData)
	trackRunPrognosis(trip_id, date)
}

module.exports = prognoseAndPublishVehiclePosition
