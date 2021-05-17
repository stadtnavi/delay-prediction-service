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
	t TIMESTAMPTZ NOT NULL,
	CONSTRAINT vehicle_positions_unique UNIQUE (vehicle_id, t)
);
CREATE INDEX ON vehicle_positions (vehicle_id, t);
-- CREATE INDEX ON vehicle_positions USING GIST (location);

CREATE TYPE matched_vehicle AS (
	trip_id TEXT,
	date TIMESTAMP,
	shape_id TEXT,
	nr_of_consec_vehicle_pos BIGINT
);

CREATE FUNCTION all_vehicle_matches(
	_yesterday date,
	_today date,
	_t_arrival_min timestamptz,
	_t_arrival_max timestamptz,
	_t_vehicle_pos_min timestamptz,
	_t_vehicle_pos_max timestamptz,
	_vehicle_id text
)
RETURNS SETOF matched_vehicle
AS $$
	-- todo: this is ugly, clean it up
	SELECT *
	FROM (
	SELECT
		DISTINCT ON (shapes.shape_id, vehicle_id)
		shape_ids.trip_id,
		shape_ids.date,
		shapes.shape_id,
		count(pos.pos_id) OVER (PARTITION BY shapes.shape_id ORDER BY trip_id) as nr_of_consec_vehicle_pos
	FROM (
		SELECT DISTINCT ON (trips.shape_id)
			trips.shape_id,
			trips.trip_id,
			date
		FROM arrivals_departures
		INNER JOIN trips ON trips.trip_id = arrivals_departures.trip_id
		WHERE True
		-- cut off by date for better performance
		AND (date = _yesterday OR date = _today)
		-- We're just trying to find any currently active "runs" here, so it doesn't
		-- matter if we're excluding some of their arrivals/departures. We just want
		-- to find *any* arrival/departure of the "run".
		AND t_arrival >= _t_arrival_min AND t_arrival <= _t_arrival_max
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
		-- When filtering vehicle positions, we pick a longer time range. If the
		-- vehicle has a delay of n minutes, we still need to find its positions
		-- *older* than n minutes, in order to reliably identify its "run".
		AND t >= _t_vehicle_pos_min AND t <= _t_vehicle_pos_max
		ORDER BY t DESC
	) pos ON st_dwithin(shapes.shape, pos.location, pos.hdop)
	) t
	ORDER BY nr_of_consec_vehicle_pos DESC
	LIMIT 2;
$$ LANGUAGE sql;

CREATE FUNCTION vehicle_match(
	_yesterday date,
	_today date,
	_t_arrival_min timestamptz,
	_t_arrival_max timestamptz,
	_t_vehicle_pos_min timestamptz,
	_t_vehicle_pos_max timestamptz,
	_vehicle_id text
)
RETURNS matched_vehicle
AS $$
	DECLARE
		_sm matched_vehicle;
		_first matched_vehicle;
	BEGIN
		FOR _sm IN
			SELECT * FROM all_vehicle_matches(
				_yesterday,
				_today,
				_t_arrival_min,
				_t_arrival_max,
				_t_vehicle_pos_min,
				_t_vehicle_pos_max,
				_vehicle_id
			)
		LOOP
			-- all_vehicle_matches returns <= 2 results
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
