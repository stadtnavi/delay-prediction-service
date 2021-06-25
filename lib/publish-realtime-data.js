'use strict'

const mqtt = require('mqtt')
const {Writable} = require('stream')
const {
	transit_realtime: {FeedMessage, FeedHeader},
} = require('gtfs-realtime-bindings')
const logger = require('./logger')
const {
	putFeedEntity: serveFeedEntityViaHttp,
} = require('./gtfs-rt-http-server')

const MQTT_URI = process.env.MQTT_URI
if (!MQTT_URI) {
	console.error('Missing/empty MQTT_URI environment variable.')
	process.exit(1)
}

const client = mqtt.connect(MQTT_URI)
client.on('error', (err) => {
	logger.error({err}, `MQTT error: ${err.message || err}`)
})

const publishViaMqtt = async (topic, data) => {
	return await client.publish(topic, data, {
		qos: 1, // at least once
	})
}

// todo: persist across crashes, support >1 instance
let feedEntityId = 0

const publishTripUpdate = async (tU, additionalData = {}) => {
	const {
		timestamp,
	} = additionalData

	const baseTopic = `/tu/${tU.vehicle.id}`

	const entity = {
		id: ++feedEntityId + '',
		trip_update: tU,
	}
	const msg = {
		header: {
			gtfsRealtimeVersion: '2.0',
			incrementality: FeedHeader.Incrementality.DIFFERENTIAL,
			timestamp: Math.round(new Date(timestamp) / 1000),
		},
		entity: [entity],
	}

	const pbfTopic = '/gtfsrt' + baseTopic
	const asPBF = FeedMessage.encode(msg).finish()
	const jsonTopic = '/json' + baseTopic
	const asJSON = JSON.stringify(msg)
	logger.debug({pbfTopic, jsonTopic}, 'publishing TripUpdate')
	await publishViaMqtt(pbfTopic, asPBF)
	await publishViaMqtt(jsonTopic, asJSON)
	serveFeedEntityViaHttp(entity)
}

const publishVehiclePosition = async (vP, additionalData = {}) => {
	const {
		timestamp,
		route_short_name,
		trip_headsign,
	} = additionalData

	// https://github.com/stadtnavi/thingsboard-to-gtfsrt-mqtt/blob/abfbca97df0bcaa1c14a89cbe9dbdebcde7b3816/thingsboard-to-gtfsrt-mqtt.py#L183-L184
	// https://github.com/HSLdevcom/gtfsrthttp2mqtt/blob/59a21fe5e3c2d6bf34a979d8c2b7f4bf6a154130/gtfsrthttp2mqtt.py#L94-L121
	const feed_id = 'hbg'
	const agency_id = '1'
	const agency_name = '1'
	const mode = 'bus' // todo
	const route_id = vP.trip.route_id
	const direction_id = '0' // todo
	const headsign = trip_headsign || 'unknown-headsign'
	const trip_id = vP.trip.trip_id
	const next_stop = vP.stop_id || 'unknown-next-stop'
	const start_time = vP.trip.start_time || 'unknown-start-time'
	const vehicle_id = vP.vehicle.id
	// In the HSL implementation we're following, this field is *not* a real
	// Geohash (https://en.wikipedia.org/wiki/Geohash), but just spatial-tree-like
	// representation of latitude & longitude.
	// https://github.com/HSLdevcom/gtfsrthttp2mqtt/blob/59a21fe5e3c2d6bf34a979d8c2b7f4bf6a154130/gtfsrthttp2mqtt.py#L101-L108
	const latStr = vP.position.latitude + ''
	const lonStr = vP.position.longitude + ''
	const geoHash = [
		latStr.slice(0, 2) + ';' + lonStr.slice(0, 2),
		latStr[2] + lonStr[2],
		latStr[3] + lonStr[3],
		latStr[4] + lonStr[4],
	].join('/')
	const short_name = route_short_name || 'unknown-route-short-name'
	const baseTopic = '/vp/' + [
		feed_id, agency_id, agency_name,
		mode, route_id, direction_id, headsign, trip_id,
		next_stop, start_time, vehicle_id, geoHash, short_name,
	].join('/')

	const entity = {
		id: ++feedEntityId + '',
		vehicle: vP,
	}
	const msg = {
		header: {
			gtfsRealtimeVersion: '2.0',
			incrementality: FeedHeader.Incrementality.DIFFERENTIAL,
			timestamp: Math.round(new Date(timestamp) / 1000),
		},
		entity: [entity],
	}

	const pbfTopic = '/gtfsrt' + baseTopic
	const asPBF = FeedMessage.encode(msg).finish()
	const jsonTopic = '/json' + baseTopic
	const asJSON = JSON.stringify(msg)
	logger.debug({pbfTopic, jsonTopic}, 'publishing VehiclePosition')
	await publishViaMqtt(pbfTopic, asPBF)
	await publishViaMqtt(jsonTopic, asJSON)
	serveFeedEntityViaHttp(entity)
}

const publishRawVehiclePosition = async (vP) => {
	const baseTopic = `/vp-raw/${vP.vehicle.id}`

	const entity = {
		id: ++feedEntityId + '',
		vehicle: vP,
	}
	const msg = {
		header: {
			gtfsRealtimeVersion: '2.0',
			incrementality: FeedHeader.Incrementality.DIFFERENTIAL,
			timestamp: vP.timestamp,
		},
		entity: [entity],
	}

	const pbfTopic = '/gtfsrt' + baseTopic
	const asPBF = FeedMessage.encode(msg).finish()
	const jsonTopic = '/json' + baseTopic
	const asJSON = JSON.stringify(msg)
	logger.debug({pbfTopic, jsonTopic}, 'publishing VehiclePosition')
	await publishViaMqtt(pbfTopic, asPBF)
	await publishViaMqtt(jsonTopic, asJSON)
	serveFeedEntityViaHttp(entity)
}

module.exports = {
	publishTripUpdate,
	publishVehiclePosition,
	publishRawVehiclePosition,
}
