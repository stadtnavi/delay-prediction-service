#!/bin/bash
set -e
set -o pipefail
cd $(dirname $(realpath $0))

# This scripts is written for continuous deployment environments.
# Because it is idempotent and cleans up after itself (except in
# unforseen circumstances), it should be called
# - during all deployments
# - regularly (e.g. nightly), in order to use the latest GTFS feed
#
# Given two environment variables $GTFS_NAME and $GTFS_URL, it
# 1. downloads the GTFS feed
# 2. computes $GTFS_ID from the feed's name & date of modification
# 3. if there's no PostgreSQL DB $GTFS_ID (a.k.a. it's a new feed), it
#     a. imports the new GTFS feed into a new DB $GTFS_ID,
#     b. deploys tools needed by this service (see deploy.sql) into it,
# 4. if there's no trajectories dir $GTFS_ID (a.k.a. it's a new feed), it
#     a. computes trajectories from the new feed into a directory $GTFS_ID
# 6. prunes old data
#     - previous/old PostgreSQL DB
#     - previous/old trajectories directory

if [ -z "$GTFS_NAME" ]; then
	1>&2 echo 'missing $GTFS_NAME env var'
	exit 2
fi
if [ -z "$GTFS_URL" ]; then
	1>&2 echo 'missing $GTFS_URL env var'
	exit 2
fi

set -x

env | grep '^PG' || true

PATH="$(realpath node_modules/.bin):$PATH"

prev_GTFS_ID=''
if [ -s 'data/gtfs_id' ]; then
	prev_GTFS_ID="$(cat data/gtfs_id | tr -d '\n')"
	echo "previous \$GTFS_ID: $prev_GTFS_ID"
fi

# download GTFS feed to tmp file
user_agent='https://github.com/stadtnavi/delay-prediction-service'
gtfs_file="$(mktemp)"
curl -sSLf -H "$user_agent" --compressed -R "$GTFS_URL" -o "$gtfs_file"

export GTFS_ID="$GTFS_ID"
if [ -z "$GTFS_ID" ]; then
	# compute GTFS feed ID, used for directory & database names
	gtfs_modified=$(node -p "fs.statSync('$gtfs_file').mtime.toISOString().slice(0, 10)")

	export GTFS_ID=$(echo "$GTFS_NAME-$gtfs_modified" | sed 's/[^a-zA-Z0-9_]/_/g')
fi
echo "new \$GTFS_ID: $GTFS_ID"

# extract GTFS feed to tmp dir
export gtfs_dir="$(mktemp -d)"
unzip -d "$gtfs_dir" "$gtfs_file"

# rows=$(cat $gtfs_dir/shapes.txt | wc -l | bc)
# rows_with_dist=$(xsv search -s shape_dist_traveled '.+' $gtfs_dir/shapes.txt | wc -l | bc)
# if [ "$rows" != "$rows_with_dist" ]; then
# 	1>&2 echo "$gtfs_dir/shapes.txt contains rows without shape_dist_traveled"
# 	exit 1
# fi
# rows=$(cat $gtfs_dir/stop_times.txt | wc -l | bc)
# rows_with_dist=$(xsv search -s shape_dist_traveled '.+' $gtfs_dir/stop_times.txt | wc -l | bc)
# if [ "$rows" != "$rows_with_dist" ]; then
# 	1>&2 echo "$gtfs_dir/stop_times.txt contains rows without shape_dist_traveled"
# 	exit 1
# fi

existing_db="$(PGDATABASE=postgres psql -t -c "SELECT datname FROM pg_catalog.pg_database WHERE lower(datname) = lower('$GTFS_ID')" | grep -o "$GTFS_ID" || true)"
echo "existing db: $existing_db"
if [ -z "$existing_db" ]; then # database does not exist
	# work with a temporary DB for atomicity
	tmp_db="tmp_$(head -c 3 /dev/random | base64 | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9_]/_/g')"
	PGDATABASE=postgres psql -c "CREATE DATABASE $tmp_db"
	export PGDATABASE="$tmp_db"

	# import GTFS data into PostgreSQL
	gtfs-to-sql -d --trips-without-shape-id --routes-without-agency-id \
		-- $gtfs_dir/{trips,routes,agency,calendar,calendar_dates,stops,stop_times,shapes}.txt | \
		sponge | psql -b

	# set up tables, views, etc. necessary for matching
	psql -f deploy.sql

	PGDATABASE=postgres psql -c "ALTER DATABASE $tmp_db RENAME TO $GTFS_ID"
	export PGDATABASE="$GTFS_ID"
fi

if [ ! -d "data/trajectories-$GTFS_ID" ]; then # trajectories dir doesn't exist
	# sort GTFS feed files
	pushd .
	sort="$(realpath node_modules/gtfs-utils/sort.sh)"
	cd "$gtfs_dir"
	$sort
	popd

	# work with a temporary directory for atomicity
	trajectories_tmp_dir="$(mktemp -d)"
	export TRAJECTORIES_DIR="$trajectories_tmp_dir"

	# generate trajectories in trajectories/$GTFS_ID
	GTFS_DIR="$gtfs_dir" ./compute-trajectories.js

	mv "$trajectories_tmp_dir" "data/trajectories-$GTFS_ID"
	export TRAJECTORIES_DIR="data/trajectories-$GTFS_ID"
fi

# store current $GTFS_ID
echo -n "$GTFS_ID" >data/gtfs_id

if [[ ! -z "$prev_GTFS_ID" && "$GTFS_ID" != "$prev_GTFS_ID" ]]; then
	# delete old database if present
	psql -c "DROP DATABASE IF EXISTS $prev_GTFS_ID"

	# delete old trajectories if present
	if [ -d "data/trajectories-$prev_GTFS_ID" ]; then
		rm -r "data/trajectories-$prev_GTFS_ID"
	fi
fi
