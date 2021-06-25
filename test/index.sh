#!/bin/bash

set -e
set -o pipefail
cd "$(dirname $0)"
set -x

node detect-dwelling.js
env TRAJECTORIES_DIR="$PWD/read-trajectories" node read-trajectories/index.js
node match-vehicle-positions-with-trajectory.js
./herrenberg-overlapping/index.js
./herrenberg-planned-positions/index.js
