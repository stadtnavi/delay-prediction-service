BEGIN;

-- todo: is this necessary for better performance?
-- CREATE INDEX ON shapes USING GIST (shape_pt_loc);

-- todo: is a materialized view rellay necessary for better performance?
DROP VIEW shapes_aggregated;
CREATE MATERIALIZED VIEW shapes_aggregated AS
SELECT
	shape_id,
	array_agg(shape_dist_traveled) AS distances_travelled,
	ST_MakeLine(array_agg(shape_pt_loc)) AS shape
FROM (
	SELECT
		shape_id,
		shape_dist_traveled,
		ST_AsText(shape_pt_loc)::geometry AS shape_pt_loc
	FROM shapes
	ORDER by shape_id, shape_pt_sequence
) shapes
GROUP BY shape_id;
CREATE INDEX ON shapes_aggregated (shape_id);
CREATE INDEX ON shapes_aggregated USING GIST (shape);

CREATE TABLE vehicle_positions (
	id SERIAL PRIMARY KEY,
	vehicle_id TEXT NOT NULL,
	location geography(POINT) NOT NULL,
	hdop DOUBLE PRECISION NOT NULL,
	t TIMESTAMPTZ NOT NULL
);
CREATE INDEX ON vehicle_positions (vehicle_id, t);
-- CREATE INDEX ON vehicle_positions USING GIST (location);

COMMIT;
