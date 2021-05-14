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

CREATE TYPE shape_matching AS (
	shape_id TEXT,
	nr_of_consec_vehicle_pos BIGINT
);

CREATE FUNCTION all_shapes_matching_vehicle_positions(
	_yesterday date,
	_today date,
	_t_min timestamptz,
	_t_max timestamptz,
	_vehicle_id text
)
RETURNS SETOF shape_matching
AS $$
	SELECT
		shapes.shape_id,
		count(pos.pos_id) as nr_of_consec_vehicle_pos
	FROM (
		SELECT DISTINCT ON (trips.shape_id)
			trips.shape_id
		FROM arrivals_departures
		INNER JOIN trips ON trips.trip_id = arrivals_departures.trip_id
		WHERE True
		-- cut off by date for better performance
		-- todo: use range from t_min to t_max instead of hardcoded values
		AND (date = _yesterday OR date = _today)
		AND t_arrival >= _t_min AND t_arrival <= _t_max
	) shape_ids
	INNER JOIN shapes_aggregated shapes ON shapes.shape_id = shape_ids.shape_id
	INNER JOIN (
		SELECT
			id as pos_id,
			vehicle_id,
			location,
			hdop,
			t
		FROM vehicle_positions
		WHERE True
		AND vehicle_id = _vehicle_id
		AND t >= _t_min AND t <= _t_max
	) pos ON st_dwithin(shapes.shape, pos.location, pos.hdop)
	GROUP BY shapes.shape_id, vehicle_id
	ORDER BY nr_of_consec_vehicle_pos DESC
	LIMIT 2;
$$ LANGUAGE sql;

CREATE FUNCTION shape_matching_vehicle_positions(
	_yesterday date,
	_today date,
	_t_min timestamptz,
	_t_max timestamptz,
	_vehicle_id text
)
RETURNS shape_matching
AS $$
	DECLARE
		_sm shape_matching;
		_first shape_matching;
	BEGIN
		FOR _sm IN
			SELECT * FROM all_shapes_matching_vehicle_positions(
				_yesterday,
				_today,
				_t_min,
				_t_max,
				_vehicle_id
			)
		LOOP
			-- all_shapes_matching_vehicle_positions returns <= 2 results
			IF _first IS NULL THEN
				_first := _sm;
			ELSEIF _sm.nr_of_consec_vehicle_pos = _first.nr_of_consec_vehicle_pos THEN
				RAISE NOTICE '>1 shape with *equal* nr of matching consecutive vehicle positions';
				RETURN NULL; -- abort
			END IF;
		END LOOP;
		RETURN _first;
	END;
$$ LANGUAGE plpgsql;

COMMIT;
