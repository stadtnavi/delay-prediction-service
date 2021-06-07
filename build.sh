#!/bin/bash
set -e
set -o pipefail
cd $(dirname $(realpath $0))
set -x

# gtfs_dir=~/stadtnavi/gtfs-hub/data/gtfs/VVS.filtered.gtfs
if [ -z "$gtfs_dir" ]; then
	1>&2 echo 'missing $gtfs_dir env var'
	exit 1
fi

rows=$(cat $gtfs_dir/shapes.txt | wc -l | bc)
rows_with_dist=$(xsv search -s shape_dist_traveled '.+' $gtfs_dir/shapes.txt | wc -l | bc)
if [ "$rows" != "$rows_with_dist" ]; then
	1>&2 echo "$gtfs_dir/shapes.txt contains rows without shape_dist_traveled"
	exit 1
fi
rows=$(cat $gtfs_dir/stop_times.txt | wc -l | bc)
rows_with_dist=$(xsv search -s shape_dist_traveled '.+' $gtfs_dir/stop_times.txt | wc -l | bc)
if [ "$rows" != "$rows_with_dist" ]; then
	1>&2 echo "$gtfs_dir/stop_times.txt contains rows without shape_dist_traveled"
	exit 1
fi

# import GTFS data
gtfs-to-sql -d --trips-without-shape-id --routes-without-agency-id \
	-- $gtfs_dir/{trips,routes,agency,calendar,calendar_dates,stops,stop_times,shapes}.txt | \
	psql -b

pushd .
sort="$(realpath node_modules/gtfs-utils/sort.sh)"
cd "$gtfs_dir"
$sort
popd
GTFS_DIR="$gtfs_dir" ./compute-trajectories.js

# set up tables, views, etc. necessary for matching
psql -f deploy.sql
