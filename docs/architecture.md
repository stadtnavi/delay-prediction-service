# `delay-prediction-service` architecture

*Note:* [*How `delay-prediction-service` works*](how-it-works.md) is a detailed step-by-step walkthrough on how this service works.

This service needs access to the following infrastructure

- a **PostgreSQL database**, contains
	- the schedules data, generated from GTFS-Static data by [`build.sh`](../build.sh)
- a **data directory**, contains
	- *trajectories*, generated from GTFS-Static data by [`build.sh`](../build.sh)
	- information about the GTFS feed being used
- **City of Herrenberg's [Thingsboard](https://thingsboard.io/)** instance
	- provides the realtime vehicle positions
- Stadnavi's **MQTT broker**
	- receives predicted GTFS-Realtime `VehiclePosition`s & `TripUpdate`s
