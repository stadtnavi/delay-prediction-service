'use strict'

const {ok} = require('assert')
const matchVehiclePositionsWithTrajectory = require('../lib/match-vehicle-positions-with-trajectory')



{ // overlapping shapes
	const tr780 = require('./7.T0.31-780-j21-2.2.H-2021-06-14.json')
	const tr782 = require('./45.T0.31-782-j21-1.5.H-2021-06-14.json')

	const vehiclePositions = [
		{t: '2021-06-14T11:16:36.860Z', longitude: 8.8654, latitude: 48.5945},
		{t: '2021-06-14T11:21:25.373Z', longitude: 8.8639, latitude: 48.5941},
		{t: '2021-06-14T11:22:37.920Z', longitude: 8.8644, latitude: 48.5934},
		{t: '2021-06-14T11:22:40.223Z', longitude: 8.8644, latitude: 48.5934},
		{t: '2021-06-14T11:27:22.776Z', longitude: 8.8681, latitude: 48.5952},
		{t: '2021-06-14T11:28:34.763Z', longitude: 8.8724, latitude: 48.5937},
		{t: '2021-06-14T11:29:50.796Z', longitude: 8.8755, latitude: 48.5904},
		{t: '2021-06-14T11:29:51.379Z', longitude: 8.8755, latitude: 48.5904},
		{t: '2021-06-14T11:31:00.944Z', longitude: 8.8777, latitude: 48.5915},
		{t: '2021-06-14T11:31:01.411Z', longitude: 8.8777, latitude: 48.5915},
		{t: '2021-06-14T11:32:10.952Z', longitude: 8.8778, latitude: 48.5916},
		{t: '2021-06-14T11:32:11.592Z', longitude: 8.8778, latitude: 48.5916},
		{t: '2021-06-14T11:33:20.989Z', longitude: 8.8806, latitude: 48.594},
		{t: '2021-06-14T11:34:30.030Z', longitude: 8.8756, latitude: 48.5945},
		{t: '2021-06-14T11:34:31.043Z', longitude: 8.8756, latitude: 48.5945},
		{t: '2021-06-14T11:35:39.984Z', longitude: 8.8818, latitude: 48.5965},
		{t: '2021-06-14T11:39:06.893Z', longitude: 8.8898, latitude: 48.6021},
		{t: '2021-06-14T11:40:16.295Z', longitude: 8.8897, latitude: 48.6019},
	]

	// for (let n = 5; n < vehiclePositions.length; n++) {
	// 	const pos = vehiclePositions.slice(0, n + 1)
	// 	console.log(`\n\n\nwith first ${n} positions`)
	// 	console.log({
	// 		score780: matchVehiclePositionsWithTrajectory(pos, tr780),
	// 		score782: matchVehiclePositionsWithTrajectory(pos, tr782),
	// 	})
	// }

	const score780 = matchVehiclePositionsWithTrajectory(vehiclePositions, tr780)
	const score782 = matchVehiclePositionsWithTrajectory(vehiclePositions, tr782)
	ok(score782 < score780 * .8, 'score(782) is not lower than score(780) * .8')
}



{ // opposite directions at the same time
	// from 2021-06-15T17:21:00+02 de:08115:4512:5:D Herrenb. ZOB Bahnhofstraße
	// to   2021-06-15T17:38:00+02 de:08115:4800:0:3 Herrenberg Waldfriedhof
	const trOutbound = require('./53.T0.31-782-j21-1.5.H-2021-06-15.json')
	// from 2021-06-15T17:20:00+02 de:08115:4800:0:3 Herrenberg Waldfriedhof
	// to   2021-06-15T17:39:00+02 de:08115:4512:5:D Herrenb. ZOB Bahnhofstraße
	const trReturn = require('./23.T0.31-782-j21-1.7.R-2021-06-15.json')

	const vehiclePositions = [
		// approaching dwelling location (Herrenberg Waldfriedhof)
		{t: '2021-06-15T17:07:28.507+02:00', longitude: 8.8758, latitude: 48.5942},
		{t: '2021-06-15T17:13:19.931+02:00', longitude: 8.8971, latitude: 48.6028},
		// dwelling
		{t: '2021-06-15T17:14:27.597+02:00', longitude: 8.9038, latitude: 48.6022},
		{t: '2021-06-15T17:21:52.914+02:00', longitude: 8.9037, latitude: 48.6022},
		// has left dwelling location, starting 782 return run
		{t: '2021-06-15T17:24:05.907+02:00', longitude: 8.888,  latitude: 48.6013},
		{t: '2021-06-15T17:27:34.705+02:00', longitude: 8.8785, latitude: 48.5955},
	]

	const scoreOutbound = matchVehiclePositionsWithTrajectory(vehiclePositions, trOutbound)
	const scoreReturn = matchVehiclePositionsWithTrajectory(vehiclePositions, trReturn)
	console.error({scoreOutbound, scoreReturn})
	ok(scoreReturn < scoreOutbound * .8, 'score(trReturn) is not lower than score(trReturn) * .8')
}



console.log('vehicle positions -> trajectories matching works ✔︎')
