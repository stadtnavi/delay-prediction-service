'use strict'

const fetchShape = async (db, shape_id) => {
	let {rows} = await db.query(`
		SELECT
			ST_Y(shapes.shape_pt_loc::geometry) as lat,
			ST_X(shapes.shape_pt_loc::geometry) as lon,
			-- todo: altitude?
			shape_dist_traveled as dist
		FROM shapes
		WHERE shape_id = $1
		ORDER BY shape_pt_sequence
	`, [
		shape_id,
	])
	if (rows.length === 0) throw new Error(`can't find shape ${shape_id}`)
	return {
		type: 'LineString',
		coordinates: rows.map(({lon, lat, dist}) => [lon, lat, null, dist]),
	}
}

module.exports = fetchShape
