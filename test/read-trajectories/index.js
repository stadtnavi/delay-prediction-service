'use strict'

const readTrajectories = require('../../lib/read-trajectories')
const {deepStrictEqual: eql} = require('assert')

const ids = [
	'foo', 'bar',
	'nonexistent-1',
	'baz', 'qux',
	'nonexistent-2', 'nonexistent-3', 'nonexistent-4', 'nonexistent-5',
	'nonexistent-6', 'nonexistent-7', 'nonexistent-8', 'nonexistent-9',
	'nonexistent-10', 'nonexistent-11', 'nonexistent-12', 'nonexistent-13',
	'quax',
]

;(async () => {
	const read = []
	for await (const tr of readTrajectories(ids)) {
		const {id} = tr.properties
		read.push(id)
	}

	eql(read, [
		'foo', 'bar', 'baz', 'qux', 'quax',
	], `emitted trajectory IDs don't match`)
	console.log('readTrajectories works ✔︎')
})()
.catch((err) => {
	console.error(err)
	process.exit(1)
})
