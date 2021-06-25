'use strict'

const ttlBuffer = require('ttl-buffer')

// We want to publish the *planned* vehicle position of a run only when there's
// no *predicted* vehicle position available. In order to determine if a run's
// vehicle position has recently been predicted, we track them here.

const onRunPrognosis = (runs, runId) => {
	runs.set(runId, (runs.get(runId) || 0) + 1)
	return runs
}

const onRunPrognosisExpire = (runs, runId) => {
	if (runs.has(runId)) { // existing prognosis for this run
		const refCount = runs.get(runId)
		if (refCount === 1) runs.delete(runId)
		else runs.set(runId, refCount - 1)
	}
	return runs
}

const recentlyPrognosedRuns = ttlBuffer({
	// todo: make configurable via env var?
	ttl: 5 * 60 * 1000, // 5m
	initialValue: new Map(),
	in: onRunPrognosis,
	out: onRunPrognosisExpire,
})

const trackRunPrognosis = (trip_id, date) => {
	const runId = trip_id + '-' + date
	recentlyPrognosedRuns.push(runId)
}

const isRecentlyPrognosedRun = (trip_id, date) => {
	const runId = trip_id + '-' + date
	return recentlyPrognosedRuns.valueOf().has(runId)
}

module.exports = {
	trackRunPrognosis,
	isRecentlyPrognosedRun,
}
