'use strict'

const ttlBuffer = require('ttl-buffer')
const logger = require('./logger')

// We want to publish the *planned* vehicle position of a run only when there's
// no *predicted* vehicle position available. In order to determine if a run's
// vehicle position has recently been predicted, we track them here.

const onRunPrognosis = (runs, runId) => {
	const refCount = (runs.get(runId) || 0) + 1
	runs.set(runId, refCount)
	logger.trace({runId, refCount}, 'recently prognosed run: increasing ref count')
	return runs
}

const onRunPrognosisExpire = (runs, runId) => {
	if (runs.has(runId)) { // existing prognosis for this run
		const refCount = runs.get(runId) - 1
		if (refCount <= 0) runs.delete(runId)
		else runs.set(runId, refCount)
		logger.trace({runId, refCount}, 'recently prognosed run: TTL expired, decreasing ref count')
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
	const isRecentlyPrognosed = recentlyPrognosedRuns.valueOf().has(runId)
	logger.trace({runId, isRecentlyPrognosed}, 'checking if recently prognosed run')
	return isRecentlyPrognosed
}

module.exports = {
	trackRunPrognosis,
	isRecentlyPrognosedRun,
}
