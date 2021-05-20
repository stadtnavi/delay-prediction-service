'use strict'

const fetchShape = async (db, shape_id) => {
	let {rows} = await db.query(`
		SELECT
			ST_AsGeoJSON(shape) as shape
		FROM shapes_aggregated
		WHERE shape_id = $1
		LIMIT 1
	`, [
		shape_id,
	])
	if (rows.length === 0) throw new Error(`can't find shape ${shape_id}`)
	return JSON.parse(rows[0].shape)
}

module.exports = fetchShape
