'use strict'

const {DateTime} = require('luxon')
const pgTypes = require('pg-types')
const {Pool} = require('pg')

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
const pool = new Pool()

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

// https://node-postgres.com/features/transactions
const runWithinDbTransaction = async (fn) => {
	const client = await pool.connect()
	try {
		await client.query('BEGIN')
		const retval = await fn(client)
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
