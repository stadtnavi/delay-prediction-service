#!/usr/bin/env node
'use strict'

// this is the counterpart to build.sh

const {join: pathJoin} = require('path')
const {Client: PostgresClient} = require('pg')
const formatSQL = require('pg-format')
const {readdir, rm} = require('fs/promises')

const GTFS_NAME = process.env.GTFS_NAME
if (!GTFS_NAME) {
	console.error('missing/empty GTFS_NAME env var')
	process.exit(1)
}

const DATA_DIR = pathJoin(__dirname, '..', 'data')

// keep the most n DBs called $GTFS_NAME…
const NR_OF_DBS_KEPT = 2
// keep the most n trajectories directories called trajectories-$GTFS_NAME…
const NR_OF_TRAJECTORIES_DIRS_KEPT = 2

;(async (cfg) => {
	{ // delete old DBs
		const prefix = `${GTFS_NAME}_`

		const db = new PostgresClient({
			database: 'postgres'
		})
		await db.connect()

		const {rows} = await db.query(`
			SELECT
				datname
			FROM pg_database
		`)
		const dbs = rows
		.map(row => row.datname)
		.filter(db => db.slice(0, prefix.length) === prefix)
		.sort()

		const dbsToDelete = dbs.slice(0, -NR_OF_DBS_KEPT)
		for (const dbToDelete of dbsToDelete) {
			console.info(`deleting database ${dbToDelete}`)
			await db.query(formatSQL('DROP DATABASE %I', dbToDelete))
		}

		db.end()
	}

	{ // delete old trajectories directories
		const prefix = `trajectories-${GTFS_NAME}_`

		const trajectoriesDirs = (await readdir(DATA_DIR))
		.filter(db => db.slice(0, prefix.length) === prefix)
		.sort()
		console.error('trajectoriesDirs', trajectoriesDirs)

		const dirsToDelete = trajectoriesDirs.slice(0, -NR_OF_TRAJECTORIES_DIRS_KEPT)
		for (const dirToDelete of dirsToDelete) {
			const fullPath = pathJoin(DATA_DIR, dirToDelete)
			console.info(`deleting trajectories directory ${fullPath}`)
			await rm(fullPath, {recursive: true})
		}
	}

	console.debug('done')
})()
.catch((err) => {
	console.error(err)
	process.exit(1)
})
