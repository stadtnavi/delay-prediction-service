/* eslint-disable no-irregular-whitespace */
'use strict'

const {findDwellingRange} = require('../lib/detect-dwelling')
const {deepStrictEqual: eql} = require('assert')

// In this scenario, the vehicle continuously moves by a bit, so that
// - it will eventually have moved further away from the first position than the threshold (so relative to the first position, it doesn't count as dwelling)
// - relative to a later position (the 2nd in this case), it does count (long enough & close enough).
const positions = [
	{t: 190, lon: 8.8625, lat: 48.594}, // a
	{t: 220, lon: 8.8615, lat: 48.594}, // b –  ~37m from a
	{t: 250, lon: 8.8610, lat: 48.594}, // c –  ~74m from a
	{t: 270, lon: 8.8604, lat: 48.594}, // d – ~118m from a
	{t: 310, lon: 8.8603, lat: 48.594}, // e – ~125m & 100s from a, but ~88m & 90s from b!
	{t: 330, lon: 8.8605, lat: 48.594}, // f – ~74m & 110s from b
	{t: 350, lon: 8.8602, lat: 48.594}, // g – ~96m & 130s from b, end of dwelling
	{t: 380, lon: 8.8597, lat: 48.594}, // h – ~132m & 150s from b
]

const [iStart, iEnd] = findDwellingRange(positions)
eql(iStart, 1, 'iStart')
eql(iEnd, 6, 'iEnd')

console.log('dwelling detecting works ✔︎')
