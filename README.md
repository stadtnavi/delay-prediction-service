# delay-prediction-service

**Predict delays for [Herrenberg](https://en.wikipedia.org/wiki/Herrenberg) buses.**

[![Docker build status](https://img.shields.io/docker/build/stadtnavi/delay-prediction-service.svg)](https://hub.docker.com/r/stadtnavi/delay-prediction-service/)
[![dependency status](https://img.shields.io/david/stadtnavi/delay-prediction-service.svg)](https://david-dm.org/stadtnavi/delay-prediction-service)
![ISC-licensed](https://img.shields.io/github/license/stadtnavi/delay-prediction-service.svg)


## running via Docker

A Docker image [is available as `stadtnavi/delay-prediction-service`](https://hub.docker.com/r/stadtnavi/delay-prediction-service).

```shell
docker run -d -p 3000:3000 stadtnavi/delay-prediction-service
```


## running manually

```shell
git clone https://github.com/stadtnavi/delay-prediction-service.git
cd delay-prediction-service
npm install --production
npm start
```
