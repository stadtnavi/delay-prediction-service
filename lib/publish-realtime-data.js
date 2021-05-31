'use strict'

const mqtt = require('mqtt')
const {Writable} = require('stream')
const {
	transit_realtime: {TripUpdate},
} = require('gtfs-realtime-bindings')
const logger = require('./logger')

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
	const topic = `/gtfsrt/tu/${tU.vehicle.id}`
	const encoded = TripUpdate.encode(tU)
	logger.debug({topic}, 'publishing TripUpdate')
	await publish(topic, encoded)
}

module.exports = {
	publishTripUpdate,
}
