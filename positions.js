#!/usr/bin/env node
'use strict'

const logger = require('./lib/logger')
const subscribeToVehiclePositions = require('./lib/vehicle-positions')

logger.level = Infinity // set to silent

const abortWithError = (err) => {
	console.error(err)
	process.exit(1)
}

subscribeToVehiclePositions()
.on('data', (vehPos) => {
	process.stdout.write(JSON.stringify(vehPos) + '\n')
})
.on('error', abortWithError)
