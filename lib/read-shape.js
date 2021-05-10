'use strict'

const tile38 = require('./tile38')

// todo: don't abuse the CHANS cmd, use extract-gtfs-shapes with fs.readFile?
const readShape = async (shapeId) => {
	// todo: what if shapeId contains special chars?
	const chans = await tile38.chans(shapeId)
	const chan = chans.find(([id]) => id === shapeId)
	if (!chan) return null

	const [id, collection, addr, definition] = chan
	const objectIdx = definition.findIndex(part => part === 'OBJECT')
	return JSON.parse(definition[objectIdx + 1])
}

module.exports = readShape
