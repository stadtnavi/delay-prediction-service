#!/bin/bash
set -e
set -o pipefail
cd $(dirname $(realpath $0))
set -x

gtfs_dir=~/stadtnavi/gtfs-hub/data/gtfs/VVS.filtered.gtfs

# import GTFS data
gtfs-to-sql -d --trips-without-shape-id --routes-without-agency-id \
	-- $gtfs_dir/{trips,routes,agency,calendar,calendar_dates,stops,stop_times,shapes}.txt | \
	psql -b

# set up tables, views, etc. necessary for matching
psql -f deploy.sql

# todo: remove
psql -f herrenberg-dummy-data.sql
