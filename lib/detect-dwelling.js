'use strict'

const debug = require('debug')('delay-prediction-service:detect-dwelling')
const {default: _distance} = require('@turf/distance')
const {point} = require('@turf/helpers')
const logger = require('./logger')

const distance = (lon1, lat1, lon2, lat2) => {
	return _distance(point([lon1, lat1]), point([lon2, lat2]))
}

// I have analyzed 800k bus positions from 2021-06-05T15:20:44+02 until
// 2021-06-10T09:33:04+02. The distribution of dwelling durations (which I
// defined periods of time where a vehicle doesn't
// move more than 120 meters) looks as follows:
// # NumSamples = 1896; Min = 30.00; Max = 1500.00
// # 59 values outside of min/max
// # Mean = 518.299578; Variance = 9257824.112785; SD = 3042.667269; Median 136.000000
// # each ∎ represents a count of 5
//    30.0000 -    44.7000 [     0]:
//    44.7000 -    59.4000 [    95]: ∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎
//    59.4000 -    74.1000 [   305]: ∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎
//    74.1000 -    88.8000 [   416]: ∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎
//    88.8000 -   103.5000 [     1]:
//   103.5000 -   118.2000 [     0]:
//   118.2000 -   132.9000 [     2]:
//   132.9000 -   147.6000 [   267]: ∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎
//   147.6000 -   162.3000 [   127]: ∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎
//   162.3000 -   177.0000 [     0]:
//   177.0000 -   191.7000 [     0]:
//   191.7000 -   206.4000 [    37]: ∎∎∎∎∎∎∎
//   206.4000 -   221.1000 [   122]: ∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎
//   221.1000 -   235.8000 [    23]: ∎∎∎∎
//   235.8000 -   250.5000 [     0]:
//   250.5000 -   265.2000 [     0]:
//   265.2000 -   279.9000 [    67]: ∎∎∎∎∎∎∎∎∎∎∎∎∎
//   279.9000 -   294.6000 [    48]: ∎∎∎∎∎∎∎∎∎
//   294.6000 -   309.3000 [     1]:
//   309.3000 -   324.0000 [     0]:
//   324.0000 -   338.7000 [     2]:
//   338.7000 -   353.4000 [    40]: ∎∎∎∎∎∎∎∎
//   353.4000 -   368.1000 [     6]: ∎
//   368.1000 -   382.8000 [     0]:
//   382.8000 -   397.5000 [     1]:
//   397.5000 -   412.2000 [    21]: ∎∎∎∎
//   412.2000 -   426.9000 [    17]: ∎∎∎
//   426.9000 -   441.6000 [     3]:
//   441.6000 -   456.3000 [     1]:
//   456.3000 -   471.0000 [     4]:
//   471.0000 -   485.7000 [    10]: ∎∎
//   485.7000 -   500.4000 [    13]: ∎∎
//   500.4000 -   515.1000 [     4]:
//   515.1000 -   529.8000 [     0]:
//   529.8000 -   544.5000 [     2]:
//   544.5000 -   559.2000 [    15]: ∎∎∎
//   559.2000 -   573.9000 [    10]: ∎∎
//   573.9000 -   588.6000 [     1]:
//   588.6000 -   603.3000 [     0]:
//   603.3000 -   618.0000 [    10]: ∎∎
//   618.0000 -   632.7000 [     6]: ∎
//   632.7000 -   647.4000 [     0]:
//   647.4000 -   662.1000 [     0]:
//   662.1000 -   676.8000 [     1]:
//   676.8000 -   691.5000 [    12]: ∎∎
//   691.5000 -   706.2000 [     8]: ∎
//   706.2000 -   720.9000 [     2]:
//   720.9000 -   735.6000 [     1]:
//   735.6000 -   750.3000 [     2]:
//   750.3000 -   765.0000 [     7]: ∎
//   765.0000 -   779.7000 [     3]:
//   779.7000 -   794.4000 [     1]:
//   794.4000 -   809.1000 [     3]:
//   809.1000 -   823.8000 [     7]: ∎
//   823.8000 -   838.5000 [     4]:
//   838.5000 -   853.2000 [     6]: ∎
//   853.2000 -   867.9000 [     1]:
//   867.9000 -   882.6000 [     3]:
//   882.6000 -   897.3000 [     6]: ∎
//   897.3000 -   912.0000 [     6]: ∎
//   912.0000 -   926.7000 [     1]:
//   926.7000 -   941.4000 [     3]:
//   941.4000 -   956.1000 [     3]:
//   956.1000 -   970.8000 [     1]:
//   970.8000 -   985.5000 [     2]:
//   985.5000 -  1000.2000 [     9]: ∎
//  1000.2000 -  1014.9000 [     0]:
//  1014.9000 -  1029.6000 [     5]: ∎
//  1029.6000 -  1044.3000 [     6]: ∎
//  1044.3000 -  1059.0000 [     5]: ∎
//  1059.0000 -  1073.7000 [     0]:
//  1073.7000 -  1088.4000 [     2]:
//  1088.4000 -  1103.1000 [     3]:
//  1103.1000 -  1117.8000 [     4]:
//  1117.8000 -  1132.5000 [     3]:
//  1132.5000 -  1147.2000 [     3]:
//  1147.2000 -  1161.9000 [     5]: ∎
//  1161.9000 -  1176.6000 [     5]: ∎
//  1176.6000 -  1191.3000 [     5]: ∎
//  1191.3000 -  1206.0000 [     5]: ∎
//  1206.0000 -  1220.7000 [     1]:
//  1220.7000 -  1235.4000 [     1]:
//  1235.4000 -  1250.1000 [     0]:
//  1250.1000 -  1264.8000 [     2]:
//  1264.8000 -  1279.5000 [     2]:
//  1279.5000 -  1294.2000 [     0]:
//  1294.2000 -  1308.9000 [     0]:
//  1308.9000 -  1323.6000 [     0]:
//  1323.6000 -  1338.3000 [     1]:
//  1338.3000 -  1353.0000 [     1]:
//  1353.0000 -  1367.7000 [     0]:
//  1367.7000 -  1382.4000 [     0]:
//  1382.4000 -  1397.1000 [     0]:
//  1397.1000 -  1411.8000 [     2]:
//  1411.8000 -  1426.5000 [     2]:
//  1426.5000 -  1441.2000 [     0]:
//  1441.2000 -  1455.9000 [     1]:
//  1455.9000 -  1470.6000 [     1]:
//  1470.6000 -  1485.3000 [     3]:
//  1485.3000 -  1500.0000 [     0]:
// I haven't looked into what specifically causes these characteristic spikes, but
// *assume* that any duration above 80s (after the first spike) is due to buses
// dwelling, waiting for the next run after they have finished one.
const DWELL_MIN_DURATION = 120 // seconds
const DWELL_MAX_MOVEMENT = .12 // km

// this algorithm seems to be O(n ^ 2)
// todo: cache using WeakMap
// todo: respect positions[].hdop
const findDwellingRanges = function* (positions) {
	// move backwards, find a pair that is within DWELL_MAX_MOVEMENT
	for (let i = positions.length - 1; i >= 1; i--) {
		const p1 = positions[i - 1]
		const p2 = positions[i]
		const d = distance(p1.longitude, p1.latitude, p2.longitude, p2.latitude)

		debug('pair?', {d, iP1: i - 1, p1, iP2: i, p2})
		if (d > DWELL_MAX_MOVEMENT) continue

		// find potential dwelling range
		const iEnd = i
		const pEnd = p2
		// move backwards as long as within DWELL_MAX_MOVEMENT
		for (let j = i - 2; j >= 0; j--) {
			const p = positions[j]
			const d = distance(p.longitude, p.latitude, pEnd.longitude, pEnd.latitude)

			debug('still dwelling?', {d, j, p, iEnd, pEnd})
			if (j === 0 || d > DWELL_MAX_MOVEMENT) { // not dwelling anymore
				const iStart = j === 0 ? j : j + 1

				// check if dwelling range fulfills criteria
				const pStart = positions[iStart]
				const dur = Date.parse(pEnd.t) - Date.parse(pStart.t)
				debug('pot. dwelling range', {dur, iStart, pStart, iEnd, pEnd})
				if (dur >= DWELL_MIN_DURATION * 1000) {
					debug('dwelling range!', {iStart, iEnd, dur})
					yield [iStart, iEnd, pStart, pEnd]
					// i = iStart // continue after dwelling range
					break
				}
			}
		}
	}
}

const DWELL_TRUNCATE_MIN_DIST = .3 // km
const DWELL_AT_START_TRUNCATE_MAX_DIST = .3 // km
const removePositionsBeforeDwelling = (positions, tr) => {
	if (positions.length <= 2) return positions

	logger.trace({tr: tr.properties.id}, 'checking for distant dwelling locations')

	const trCoords = tr.geometry.coordinates
	for (const [iStart, iEnd, posStart] of findDwellingRanges(positions)) {
		const distToDwellingLoc = (c) => {
			return distance(c[0], c[1], posStart.longitude, posStart.latitude) - DWELL_MAX_MOVEMENT
		}

		if (distToDwellingLoc(trCoords[0]) <= DWELL_AT_START_TRUNCATE_MAX_DIST) {
			logger.trace(`dwelling loc is <=${DWELL_AT_START_TRUNCATE_MAX_DIST}m away from start of trajectory, truncating positions`)
			return positions.slice(iEnd) // keep last position in dwelling range
		}
		if (trCoords.every(c => distToDwellingLoc(c) > + DWELL_TRUNCATE_MIN_DIST)) {
			logger.trace(`dwelling loc is >=${DWELL_TRUNCATE_MIN_DIST}m away, truncating positions`)
			return positions.slice(iEnd) // keep last position in dwelling range
		}
		logger.trace('dwelling loc is too close to trajectory, keeping positions')
	}

	return positions
}

module.exports = {
	findDwellingRanges,
	removePositionsBeforeDwelling,
}
