# delay-prediction-service

**Predict delays for [Herrenberg](https://en.wikipedia.org/wiki/Herrenberg) buses.** Part of [Stadtnavi Herrenberg](https://herrenberg.stadtnavi.de).

[![CI status tests](https://img.shields.io/github/workflow/status/stadtnavi/delay-prediction-service/lint,%20build%20&%20publish%20Docker%20image/main)](https://github.com/stadtnavi/delay-prediction-service/actions)
[![dependency status](https://img.shields.io/david/stadtnavi/delay-prediction-service.svg)](https://david-dm.org/stadtnavi/delay-prediction-service)
![ISC-licensed](https://img.shields.io/github/license/stadtnavi/delay-prediction-service.svg)


## documentation

- [architecture](docs/architecture.md)
- [how it works](docs/how-it-works.md)


## deploying to production

A Docker image [is available as `stadtnavi/delay-prediction-service`](https://hub.docker.com/r/stadtnavi/delay-prediction-service).

*Note:* Depending on your setup, you may also need to configure access to PostgreSQL using the [`PG*` environment variables](https://www.postgresql.org/docs/current/libpq-envars.html).

### building

[`scripts/build.sh`](scripts/build.sh) is designed to allow continuous deployments. Given the name and URL of a GTFS feed, it will generate all necessary data for `delay-prediction-service` to work.

The following is an example with the [VVS feed](https://www.openvvs.de/dataset/gtfs-daten), cleaned up and served by [`gtfs.mfdz.de`](https://gtfs.mfdz.de).

```shell
docker run --rm -it \
    -v /var/delay-prediction-service-data:/app/data \
    -e TIMEZONE -e LOCALE \
    -e PGHOST -e PGUSER -e PGPASSWORD \
    -e GTFS_NAME=vss -e GTFS_URL='https://gtfs.mfdz.de/VVS.filtered.gtfs.zip'
    stadtnavi/delay-prediction-service \
    ./scripts/build.sh
```

### running

```shell
export TIMEZONE=Europe/Berlin
export LOCALE=de-DE
```

Configure access to Thingsboard, the PostgreSQL database and the MQTT broker using environment variables:

```shell
export THINGSBOARD_URL='https://thingsboard.cloud'
export THINGSBOARD_USER='…'
export THINGSBOARD_PASSWORD='…'
export THINGSBOARD_DEVICE_GROUP='…' # ID of the Thingsboard device group
export PGUSER=postgres
# …
export MQTT_URI='mqtt://localhost:1883'
```

Now run the service:

```shell
docker run --rm -it \
    -v /var/delay-prediction-service-data:/app/data \
    -p 3000:3000 \
    -e TIMEZONE -e LOCALE \
    -e THINGSBOARD_URL -e THINGSBOARD_USER -e THINGSBOARD_PASSWORD -e THINGSBOARD_DEVICE_GROUP \
    -e MQTT_URI \
    -e PGHOST -e PGUSER -e PGPASSWORD
    stadtnavi/delay-prediction-service
```


## running manually

You can also run `delay-prediction-service` manually.

```shell
# clone repo
git clone https://github.com/stadtnavi/delay-prediction-service.git
cd delay-prediction-service
# install dependencies
npm install
```

*Note:* The environment variables mentioned above must be set.

```shell
# build step
env GTFS_NAME=vss -e GTFS_URL='https://gtfs.mfdz.de/VVS.filtered.gtfs.zip' ./scripts/build.sh

# run step
node index.js
```
