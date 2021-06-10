/* eslint-disable no-irregular-whitespace */
'use strict'

const {
	findDwellingRanges,
	removePositionsBeforeDwelling,
} = require('../lib/detect-dwelling')
const {deepStrictEqual: eql} = require('assert')
const tr782 = require('./19.T0.31-782-j21-1.7.R-2021-06-15.json')

// In this scenario, the vehicle continuously moves by a bit, so that
// - it will eventually have moved further away from the first position than the threshold (so relative to the first position, it doesn't count as dwelling)
// - relative to a later position (the 2nd in this case), it does count (long enough & close enough).
const simple = [
	{t: 190, longitude: 8.8625, latitude: 48.594}, // 0
	{t: 220, longitude: 8.8615, latitude: 48.594}, // 1
	{t: 250, longitude: 8.8610, latitude: 48.594}, // 2
	{t: 270, longitude: 8.8604, latitude: 48.594}, // 3
	{t: 300, longitude: 8.8603, latitude: 48.594}, // 4
	{t: 390, longitude: 8.8605, latitude: 48.594}, // 5
	{t: 410, longitude: 8.8602, latitude: 48.594}, // 6
	{t: 440, longitude: 8.8597, latitude: 48.594}, // 7
].map(p => ({
	...p,
	t: new Date(p.t * 1000).toISOString(),
}))

{
	const gen = findDwellingRanges(simple)

	const {value: [iStart1, iEnd1, posStart1, posEnd1]} = gen.next()
	eql(iStart1, 2, '1st iteration: iStart1')
	eql(posStart1, simple[2], '1st iteration: posStart1')
	eql(iEnd1, 7, '1st iteration: iEnd1')
	eql(posEnd1, simple[7], '1st iteration: posEnd1')

	const {value: [iStart2, iEnd2, posStart2, posEnd2]} = gen.next()
	eql(iStart2, 0, '2nd iteration: iStart2')
	eql(posStart2, simple[0], '2nd iteration: posStart2')
	eql(iEnd2, 6, '2nd iteration: iEnd2')
	eql(posEnd2, simple[6], '2nd iteration: posEnd2')

	const {value: [iStart3, iEnd3, posStart3, posEnd3]} = gen.next()
	eql(iStart3, 0, '3rd iteration: iStart3')
	eql(posStart3, simple[0], '3rd iteration: posStart3')
	eql(iEnd3, 5, '3rd iteration: iEnd3')
	eql(posEnd3, simple[5], '3rd iteration: posEnd3')

	const {done, value} = gen.next()
	eql(done, true, '4th iteration: done')
}



const posDwellingAtOberjesingen = [
	{t: '2021-06-08T13:00:01+02:00', longitude: 8.8358, latitude: 48.6212}, // 0, dwelling starts
	{t: '2021-06-08T13:00:02+02:00', longitude: 8.8358, latitude: 48.6212}, // 1
	{t: '2021-06-08T13:00:03+02:00', longitude: 8.8358, latitude: 48.6212}, // 2
	{t: '2021-06-08T13:00:04+02:00', longitude: 8.8358, latitude: 48.6212}, // 3
	{t: '2021-06-08T13:01:41+02:00', longitude: 8.8358, latitude: 48.6212}, // 4
	{t: '2021-06-08T13:03:22+02:00', longitude: 8.8358, latitude: 48.6212}, // 5
	{t: '2021-06-08T13:06:43+02:00', longitude: 8.8358, latitude: 48.6212}, // 6
	{t: '2021-06-08T13:16:47+02:00', longitude: 8.8358, latitude: 48.6212}, // 7, dwelling ends
	{t: '2021-06-08T13:33:33+02:00', longitude: 8.8360, latitude: 48.6210}, // 8, ~27m from 1st
	{t: '2021-06-08T13:35:13+02:00', longitude: 8.8604, latitude: 48.6038}, // 9, ~2.7km from 1st
]

{
	const gen = findDwellingRanges(posDwellingAtOberjesingen)

	const {value: [iStart, iEnd, posStart, posEnd]} = gen.next()
	eql(iStart, 0, '1st iteration: iStart')
	eql(posStart, posDwellingAtOberjesingen[0], '1st iteration: posStart')
	eql(iEnd, 8, '1st iteration: iEnd')
	eql(posEnd, posDwellingAtOberjesingen[8], '1st iteration: posEnd')
}



const posDwellingAtHbgWaldfriedhof = [
	// approaching dwelling location (Herrenberg Waldfriedhof)
	{t: '2021-06-15T17:07:28.507+02:00', longitude: 8.8758, latitude: 48.5942},
	{t: '2021-06-15T17:13:19.931+02:00', longitude: 8.8971, latitude: 48.6028},
	// dwelling
	{t: '2021-06-15T17:14:27.597+02:00', longitude: 8.9038, latitude: 48.6022},
	{t: '2021-06-15T17:21:52.914+02:00', longitude: 8.9037, latitude: 48.6022},
	// has left dwelling location
	{t: '2021-06-15T17:24:05.907+02:00', longitude: 8.888,  latitude: 48.6013},
	{t: '2021-06-15T17:27:34.705+02:00', longitude: 8.8785, latitude: 48.5955},
]

{
	const gen = findDwellingRanges(posDwellingAtHbgWaldfriedhof)

	const {value: [iStart, iEnd, posStart, posEnd]} = gen.next()
	eql(iStart, 2, '1st iteration: iStart')
	eql(posStart, posDwellingAtHbgWaldfriedhof[2], '1st iteration: posStart')
	eql(iEnd, 3, '1st iteration: iEnd')
	eql(posEnd, posDwellingAtHbgWaldfriedhof[3], '1st iteration: posEnd')
}



{
	const pos = removePositionsBeforeDwelling(posDwellingAtHbgWaldfriedhof, tr782)
	eql(pos, posDwellingAtHbgWaldfriedhof.slice(3), `didn't truncate as expected`)
}



console.log('dwelling detection works ✔︎')
