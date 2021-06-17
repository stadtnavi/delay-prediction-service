'use strict'

const mqtt = require('mqtt')
const {Writable} = require('stream')
const {
	transit_realtime: {TripUpdate, VehiclePosition},
} = require('gtfs-realtime-bindings')
const logger = require('./logger')
const {
	putTripUpdate: serveTripUpdateViaHttp,
	putVehiclePosition: serveVehiclePositionViaHttp,
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

const publish = async (topic, data) => {
	return await client.publish(topic, data, {
		qos: 1, // at least once
	})
}

const publishTripUpdate = async (tU) => {
	const baseTopic = `/tu/${tU.vehicle.id}`
	const pbfTopic = '/gtfsrt' + baseTopic
	const asPBF = TripUpdate.encode(tU).finish()
	const jsonTopic = '/json' + baseTopic
	const asJSON = JSON.stringify(tU)
	logger.debug({pbfTopic, jsonTopic}, 'publishing TripUpdate')
	await publish(pbfTopic, asPBF)
	await publish(jsonTopic, asJSON)
	serveTripUpdateViaHttp(tU)
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
	const next_stop = 'unknown-next-stop' // todo
	const start_time = '00:00' // todo
	const vehicle_id = vP.vehicle.id
	const geoHash = '0' // todo
	const short_name = '0' // todo: route short name? fill it in
	const baseTopic = '/vp/' + [
		feed_id, agency_id, agency_name,
		mode, route_id, direction_id, trip_headsign, trip_id,
		next_stop, start_time, vehicle_id, geoHash, short_name,
	].join('/')

	const pbfTopic = '/gtfsrt' + baseTopic
	const asPBF = VehiclePosition.encode(vP).finish()
	const jsonTopic = '/json' + baseTopic
	const asJSON = JSON.stringify(vP)
	logger.debug({pbfTopic, jsonTopic}, 'publishing VehiclePosition')
	await publish(pbfTopic, asPBF)
	await publish(jsonTopic, asJSON)
	serveVehiclePositionViaHttp(vP)
}

module.exports = {
	publishTripUpdate,
	publishVehiclePosition,
}
