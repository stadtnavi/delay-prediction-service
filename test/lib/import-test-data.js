#!/usr/bin/env node
'use strict'

const {join: pathJoin} = require('path')
const {readdir, readFile} = require('fs/promises')
const formatSQL = require('pg-format')
const {Client: PostgresClient} = require('pg')
const execa = require('execa')

const importTestData = async (cfg) => {
	const {
		dbName,
		gtfsDir,
		trajectoriesDir,
	} = cfg

	{ // create PostgreSQL DB
		const db = new PostgresClient({
			database: 'postgres'
		})
		await db.connect()
		const {rows} = await db.query(`SELECT FROM pg_database WHERE datname = $1`, [dbName])
		if (rows.length === 0) { // DB does not exist
			await db.query(formatSQL('CREATE DATABASE %I', dbName))
		}
		db.end()
	}

	const MOCK_T0 = 1623670817000
	const env = {
		// todo: thingsboard
		TIMEZONE: 'Europe/Berlin',
		LOCALE: 'de-DE',
		GTFS_ID: dbName,
		TRAJECTORIES_DIR: trajectoriesDir,
		MOCK_T0: MOCK_T0 + '',
	}

	{ // import GTFS into PostgreSQL DB
		const gtfsToSql = require.resolve('gtfs-via-postgres/cli.js')
		const files = (await readdir(gtfsDir)).filter(f => f.slice(-4) === '.txt')
		await execa.command([
			gtfsToSql,
			'-d --routes-without-agency-id --trips-without-shape-id',
			'--', ...files,
			'| sponge',
			'| psql -b'
		].join(' '), {
			shell: true,
			cwd: gtfsDir,
			env: {
				...env,
				PGDATABASE: dbName,
			},
			stdio: 'inherit',
		})
	}

	{ // deploy SQL schema to PostgreSQL DB
		await execa.command('psql -b -f deploy.sql', {
			shell: true,
			cwd: pathJoin(__dirname, '..', '..'),
			env: {
				...env,
				PGDATABASE: dbName,
			},
			stdio: 'inherit',
		})
	}

	{ // generate trajectories
		// todo: remove old trajectories first
		const computeTrajectories = require.resolve('../../compute-trajectories.js')
		await execa(computeTrajectories, {
			cwd: __dirname,
			env: {
				...env,
				GTFS_DIR: gtfsDir,
			},
			stdio: 'inherit',
		})
	}
}

module.exports = importTestData
