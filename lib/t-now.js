'use strict'

let getTNow = () => Date.now()

if (process.env.MOCK_T0) {
	const t0 = parseInt(process.env.MOCK_T0)
	if (Number.isNaN(t0)) {
		throw new Error('invalid MOCK_T0 env var')
	}
	const dT = Date.now() - t0
	getTNow = () => Date.now() - dT
}

module.exports = getTNow
