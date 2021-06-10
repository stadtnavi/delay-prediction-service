#!/bin/bash

set -e
set -o pipefail
cd "$(dirname $0)"
set -x

node detect-dwelling.js
