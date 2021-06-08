'use strict'

const {DateTime} = require('luxon')
const pgTypes = require('pg-types')
const {Pool} = require('pg')
const GTFS_ID = require('./gtfs-id')
const logger = require('./logger')

const TIMEZONE = process.env.TIMEZONE
if (!TIMEZONE) {
	console.error('Missing/empty TIMEZONE environment variable.')
	process.exit(1)
}

const pgTimestampToISO = (t) => {
	const iso = (
		t.slice(0, 10) // date part
		+ 'T'
		+ t.slice(11) // time part
	)
	return DateTime
	.fromISO(iso, {zone: TIMEZONE})
	.toISO({suppressMilliseconds: true})
}
// this mutates global state, it may break 3rd party libs
// todo: get rid of this
pgTypes.setTypeParser(pgTypes.builtins.DATE, val => val)
pgTypes.setTypeParser(pgTypes.builtins.TIMESTAMP, pgTimestampToISO)
pgTypes.setTypeParser(pgTypes.builtins.TIMESTAMPTZ, pgTimestampToISO)
// todo: parse arrays of date/timestamp/timestamptz

// todo: get rid of this untestable singleton
const pool = new Pool({
	database: GTFS_ID || process.env.PGDATABASE,
})

pool.on('error', (err, client) => {
	logger.error({err, client}, 'error on PostgreSQL client')
})

// Test DB credentials by connecting once.
pool.connect()
.then(client => client.release())
.catch((err) => {
	logger.error(err)
	process.exit(1)
})

// https://github.com/brianc/node-postgres-docs/blob/40393b80440b85d26302a538790c66ff9f7076cb/content/guides/1-project-structure.md#L64
const addLoggingToQuery = (db) => {
	const _query = db.query.bind(db)
	db.query = async (sql, params) => {
		const t0 = Date.now()
		const res = await _query(sql, params)
		logger.debug({
			sql,
			params,
			duration: Date.now() - t0,
			nrOfReturnedRows: res.rows.length,
		}, 'executed query')
		return res
	}
	return function remove() {
		db.query = _query
	}
}
addLoggingToQuery(pool)

// https://node-postgres.com/features/transactions
const runWithinDbTransaction = async (fn) => {
	const client = await pool.connect()
	try {
		await client.query('BEGIN')
		const removeLogging = addLoggingToQuery(client)
		const retval = await fn(client)
		removeLogging()
		await client.query('COMMIT')
		return retval
	} catch (err) {
		await client.query('ROLLBACK')
		throw err
	} finally {
		client.release()
	}
}

module.exports = {
	pool,
	runWithinTx: runWithinDbTransaction,
}
