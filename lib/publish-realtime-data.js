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

// this is just for testing purposes
// todo: refactor, so that the testing code doesn't need this hack
const PUBLISH_VIA_MQTT = process.env.PUBLISH_VIA_MQTT !== 'false'

let publishViaMqtt = async () => {}

if (PUBLISH_VIA_MQTT) {
	const MQTT_URI = process.env.MQTT_URI
	if (!MQTT_URI) {
		console.error('Missing/empty MQTT_URI environment variable.')
		process.exit(1)
	}

	const client = mqtt.connect(MQTT_URI)
	client.on('error', (err) => {
		logger.error({err}, `MQTT error: ${err.message || err}`)
	})

	publishViaMqtt = async (topic, data) => {
		return await client.publish(topic, data, {
			qos: 1, // at least once
		})
	}
} else {
	logger.info('not publishing predictions via MQTT')
}

// todo: persist across crashes, support >1 instance
let feedEntityId = 0

const publishTripUpdate = async (tU) => {
	const baseTopic = `/tu/${tU.vehicle.id}`

	const entity = {
		id: ++feedEntityId + '',
		trip_update: tU,
	}
	const msg = {
		header: {
			gtfsRealtimeVersion: '2.0',
			incrementality: FeedHeader.Incrementality.DIFFERENTIAL,
			timestamp: tU.timestamp,
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

const publishVehiclePosition = async (vP) => {
	// https://github.com/stadtnavi/thingsboard-to-gtfsrt-mqtt/blob/abfbca97df0bcaa1c14a89cbe9dbdebcde7b3816/thingsboard-to-gtfsrt-mqtt.py#L183-L184
	const feed_id = 'hb'
	const agency_id = '1'
	const agency_name = '1'
	const mode = 'bus' // todo
	const route_id = vP.trip.route_id
	const direction_id = '0' // todo
	const trip_headsign = 'unknown-headsign' // todo
	const trip_id = vP.trip.trip_id
	const next_stop = vP.stop_id || 'unknown-next-stop'
	const start_time = vP.trip.start_time
	const vehicle_id = vP.vehicle.id
	const geoHash = '0' // todo
	const short_name = '0' // todo: route short name? fill it in
	const baseTopic = '/vp/' + [
		feed_id, agency_id, agency_name,
		mode, route_id, direction_id, trip_headsign, trip_id,
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
}
