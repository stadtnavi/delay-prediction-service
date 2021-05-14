'use strict'

const subscribeToVehiclePositions = require('./lib/vehicle-positions')

// todo
subscribeToVehiclePositions()
.on('data', console.log)
.on('error', console.error)
