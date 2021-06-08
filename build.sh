#!/bin/bash
set -e
set -o pipefail
cd $(dirname $(realpath $0))

if [ -z "$gtfs_name" ]; then
	1>&2 echo 'missing $gtfs_name env var'
	exit 2
fi
if [ -z "$gtfs_url" ]; then
	1>&2 echo 'missing $gtfs_url env var'
	exit 2
fi

PATH="$(realpath node_modules/.bin):$PATH"

env | grep '^PG' || true

set -x

# download GTFS feed to tmp file
user_agent='https://github.com/stadtnavi/delay-prediction-service'
gtfs_file="$(mktemp)"
curl -sSLf -H "$user_agent" --compressed -R "$gtfs_url" -o "$gtfs_file"

# compute GTFS feed ID, used for directory & database names
gtfs_modified=$(node -p "fs.statSync('$gtfs_file').mtime.toISOString().slice(0, 10)")
export gtfs_id=$(echo "$gtfs_name-$gtfs_modified" | sed 's/[^a-zA-Z0-9_]/_/g')

# extract GTFS feed to tmp dir
export gtfs_dir="$(mktemp -d)"
unzip -d "$gtfs_dir" "$gtfs_file"

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

# import GTFS data into PostgreSQL
PGDATABASE=postgres psql -c "CREATE DATABASE $gtfs_id"
export PGDATABASE="$gtfs_id"
gtfs-to-sql -d --trips-without-shape-id --routes-without-agency-id \
	-- $gtfs_dir/{trips,routes,agency,calendar,calendar_dates,stops,stop_times,shapes}.txt | \
	psql -b

# sort GTFS feed files
pushd .
sort="$(realpath node_modules/gtfs-utils/sort.sh)"
cd "$gtfs_dir"
$sort
popd

# generate trajectories in trajectories/$gtfs_id
trajectories_tmp_dir="$(mktemp -d)"
env TRAJECTORIES_DIR="$trajectories_tmp_dir" GTFS_DIR="$gtfs_dir" ./compute-trajectories.js
mv "$trajectories_tmp_dir" "trajectories/$gtfs_id"
export TRAJECTORIES_DIR="trajectories/$gtfs_id"

# set up tables, views, etc. necessary for matching
psql -f deploy.sql

# delete previous GTFS feed's data
if [ -s 'current_gtfs_id' ]; then
	prev_gtfs_id="$(cat current_gtfs_id | tr '\n' '')"

	# delete old database
	psql -c "DROP DATABASE $prev_gtfs_id"

	# delete old trajectories
	rimraf "trajectories/$prev_gtfs_id/*.json"
fi
echo -n "$gtfs_id" >current_gtfs_id
