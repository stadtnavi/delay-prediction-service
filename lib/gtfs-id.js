'use strict'

const {readFileSync} = require('fs')
const {join: pathJoin} = require('path')
const logger = require('./logger')

const GTFS_ID = process.env.GTFS_ID || readFileSync(pathJoin(__dirname, '..', 'data', 'gtfs_id'), {encoding: 'utf8'}).trim()
logger.info({GTFS_ID})

module.exports = GTFS_ID
