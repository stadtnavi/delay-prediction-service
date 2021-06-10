'use strict'

// I have analyzed 800k bus positions from 2021-06-05T15:20:44+02 until
// 2021-06-09T18:38:15+02. The distribution of dwelling durations (which I
// defined periods of time where a vehicle doesn't
// move more than 120 meters) looks as follows:
// # NumSamples = 1668; Min = 30.00; Max = 1000.00
// # 117 values outside of min/max
// # Mean = 492.803357
// # Variance = 8117425.369006
// # SD = 2849.109575
// # Median 136.000000
// # each ∎ represents a count of 6
//    30.0000 -    39.7000 [     0]:
//    39.7000 -    49.4000 [     0]:
//    49.4000 -    59.1000 [    83]: ∎∎∎∎∎∎∎∎∎∎∎∎∎
//    59.1000 -    68.8000 [   145]: ∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎
//    68.8000 -    78.5000 [   473]: ∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎
//    78.5000 -    88.2000 [     0]:
//    88.2000 -    97.9000 [     1]:
//    97.9000 -   107.6000 [     0]:
//   107.6000 -   117.3000 [     0]:
//   117.3000 -   127.0000 [     2]:
//   127.0000 -   136.7000 [   215]: ∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎
//   136.7000 -   146.4000 [    17]: ∎∎
//   146.4000 -   156.1000 [   113]: ∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎
//   156.1000 -   165.8000 [     0]:
//   165.8000 -   175.5000 [     0]:
//   175.5000 -   185.2000 [     0]:
//   185.2000 -   194.9000 [     0]:
//   194.9000 -   204.6000 [    31]: ∎∎∎∎∎
//   204.6000 -   214.3000 [   112]: ∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎∎
//   214.3000 -   224.0000 [     0]:
//   224.0000 -   233.7000 [    22]: ∎∎∎
//   233.7000 -   243.4000 [     0]:
//   243.4000 -   253.1000 [     0]:
//   253.1000 -   262.8000 [     0]:
//   262.8000 -   272.5000 [    21]: ∎∎∎
//   272.5000 -   282.2000 [    42]: ∎∎∎∎∎∎∎
//   282.2000 -   291.9000 [    44]: ∎∎∎∎∎∎∎
//   291.9000 -   301.6000 [     0]:
//   301.6000 -   311.3000 [     1]:
//   311.3000 -   321.0000 [     0]:
// I haven't looked into what specifically causes these characteristic spikes, but
// *assume* that any duration above 80s (after the first spike) is due to buses
// dwelling, waiting for the next run after they have finished one.
const DWELL_MIN_DURATION = 80 // seconds
const DWELL_MAX_MOVEMENT = .12 // km

const removePositionsBeforeDwelling = (positions, tr) => {
	// todo

	return positions
}

module.exports = {
	removePositionsBeforeDwelling,
}
