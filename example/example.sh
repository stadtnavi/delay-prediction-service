#!/bin/bash
set -e
set -o pipefail
cd $(dirname $(realpath $0))

1>&2 echo 'importing GTFS shapes.txt into Tile38 DB'
cat shapes.txt.gz | gunzip | ../import.js -- -

1>&2 echo 'inserting sample bus positions'
cat bus-positions-2021-04-20T13:07:29+02:00.ndjson.gz | gunzip | ./insert-bus-positions.js | tile38-cli --noprompt
