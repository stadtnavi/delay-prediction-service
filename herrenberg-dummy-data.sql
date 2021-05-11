BEGIN;

-- bus-a moving southbound on Horber-Straße
INSERT INTO vehicle_positions (vehicle_id, location, hdop, t) VALUES
('bus-a', 'POINT(8.86579 48.59385)', 30, '2021-05-11T11:08:40+02:00'),
('bus-a', 'POINT(8.86419 48.59248)', 60, '2021-05-11T11:08:50+02:00'),
('bus-a', 'POINT(8.86425 48.59106)', 60, '2021-05-11T11:09:20+02:00'),
('bus-a', 'POINT(8.86441 48.59154)', 20, '2021-05-11T11:09:40+02:00');

-- same bus-a much later and somewhere else
INSERT INTO vehicle_positions (vehicle_id, location, hdop, t) VALUES
('bus-a', 'POINT(8.810 48.610)', 40, '2021-05-11T15:30:40+02:00'),
('bus-a', 'POINT(8.810 48.610)', 40, '2021-05-11T15:30:50+02:00'),
('bus-a', 'POINT(8.815 48.610)', 40, '2021-05-11T15:31:20+02:00'),
('bus-a', 'POINT(8.820 48.615)', 40, '2021-05-11T15:31:40+02:00');

-- some other random bus at the same time
INSERT INTO vehicle_positions (vehicle_id, location, hdop, t) VALUES
('bus-b', 'POINT(8.81 48.61)', 50, '2021-05-11T11:09:00+02:00'),
('bus-b', 'POINT(8.82 48.62)', 100, '2021-05-11T11:09:30+02:00'),
('bus-b', 'POINT(8.83 48.63)', 110, '2021-05-11T11:10:00+02:00');

COMMIT;
