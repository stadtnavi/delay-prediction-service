WITH t AS (
SELECT *
FROM arrivals_departures
WHERE trip_id = '17.T0.31-782-j21-2.7.R'
AND date = '2021-05-17'
)
(
	SELECT *
	FROM t
	WHERE t_arrival <= '2021-05-17T14:32:50+02'
	ORDER BY t_arrival DESC
	LIMIT 1
) UNION (
	SELECT *
	FROM t
	WHERE t_departure >= '2021-05-17T14:32:50+02'
	ORDER BY t_departure ASC
	LIMIT 1
)
