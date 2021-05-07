'use strict'

const {Pool} = require('pg')
const logger = require('./logger')

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

// todo: don't parse timestamptz into JS Date, keep ISO 8601 strings

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
