'use strict'

const {connect} = require('mqtt')
const aedes = require('aedes')
const {createServer: createTCPServer} = require('net')
const {promisify} = require('util')

const startMQTTServerAndClient = async () => {
	const broker = aedes()
	const server = createTCPServer(broker.handle)

	await promisify(server.listen.bind(server))(30883)
	const MQTT_URI = 'mqtt://localhost:30883'

	const client = connect(MQTT_URI)
	await new Promise((resolve, reject) => {
		const timer = setTimeout(() => {
			reject(new Error('timeout connecting to MQTT broker'))
			client.end()
		}, 1000)
		client.once('connect', () => {
			clearTimeout(timer)
			resolve()
		})
	})

	const stopMQTTClientAndServer = async () => {
		client.end()
		broker.close()
		server.close()
	}

	return {
		broker, server,
		MQTT_URI, client,
		stop: stopMQTTClientAndServer,
	}
}

module.exports = startMQTTServerAndClient
