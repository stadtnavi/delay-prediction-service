BEGIN;

CREATE TABLE vehicle_positions (
	id SERIAL PRIMARY KEY,
	vehicle_id TEXT NOT NULL,
	location geography(POINT) NOT NULL,
	hdop DOUBLE PRECISION NOT NULL,
	pax DOUBLE PRECISION NOT NULL,
	t TIMESTAMPTZ NOT NULL,
	CONSTRAINT vehicle_positions_unique UNIQUE (vehicle_id, t)
);
CREATE INDEX ON vehicle_positions (vehicle_id, t);
-- CREATE INDEX ON vehicle_positions USING GIST (location);

CREATE TYPE currently_active_run AS (
	trip_id TEXT,
	date TIMESTAMP,
	shape_id TEXT
);

CREATE FUNCTION current_runs(
	_yesterday date,
	_today date,
	_t_arrival_min timestamptz,
	_t_arrival_max timestamptz
)
RETURNS SETOF currently_active_run
AS $$
	SELECT
		DISTINCT ON (trip_id, date)
		*
	FROM (
		SELECT
			trip_id,
			date,
			shape_id
		FROM arrivals_departures
		WHERE True
		-- cut off by date for better performance
		AND (date = _yesterday OR date = _today)
		-- We're just trying to find any currently active "runs" here, so it doesn't
		-- matter if we're excluding some of their arrivals/departures. We just want
		-- to find *any* arrival/departure of the "run".
		AND t_arrival >= _t_arrival_min AND t_arrival <= _t_arrival_max
		ORDER BY t_arrival ASC
	) arrs_deps;
$$ LANGUAGE sql;

COMMIT;
