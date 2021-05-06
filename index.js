'use strict'

const Redis = require('ioredis')
const logger = require('./lib/logger')

const showError = (err) => {
	logger.error(err)
	process.exit(1)
}

// Using subscriptions has no backpressure mechanism, so this process may
// read more events into memory than it can process, crashing eventually.
// > The backpressure pattern consists of a feedback mechanism that allows
// > consumers to inform upstream components when they are ready to handle
// > new messages, preventing them from becoming overwhelmed or stressed.
// https://developer.ibm.com/depmodels/reactive-systems/articles/kafka-fit-reactive-system/
// todo: let Tile38 write into a message broker, consume events from there

const startReceivingGeofenceEvents = async (onEventMsg) => {
	const tile38 = new Redis(process.env.TILE38_URL || 'redis://localhost:9851/')

	const stop = async () => {
		tile38.removeListener('pmessage', onEventMsg)
		await tile38.punsubscribe('*')
	}

	tile38.on('pmessage', onEventMsg)
	const nrOfSubscribedChannels = await tile38.psubscribe('*')
	logger.debug(`subscribed to ${nrOfSubscribedChannels} channels`)

	return stop
}

startReceivingGeofenceEvents((_, channel, event) => {
	const shapeId = channel
	event = JSON.parse(event)
	if (!event.fields) {
		logger.error({event}, 'event has no fields')
		return; // todo: what to do here?
	}
	const {
		detect,
		id: vehicleId,
		fields: {lo: longitude, la: latitude},
	} = event

	// todo
})
.catch(showError)
