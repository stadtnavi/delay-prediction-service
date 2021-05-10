'use strict'

const Redis = require('ioredis')
const tile38 = new Redis(process.env.TILE38_URL || 'redis://localhost:9851/')
tile38.setchan = tile38.createBuiltinCommand('setchan').string
tile38.chans = tile38.createBuiltinCommand('chans').string

module.exports = tile38
