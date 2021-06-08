FROM node:alpine
LABEL org.opencontainers.image.title="delay-prediction-service"
LABEL org.opencontainers.image.description="Predict delays for Herrenberg buses."
LABEL org.opencontainers.image.authors="Jannis R <mail@jannisr.de>, Stadtnavi contributors"
LABEL org.opencontainers.image.documentation="https://github.com/stadtnavi/delay-prediction-service"
LABEL org.opencontainers.image.source="https://github.com/stadtnavi/delay-prediction-service"
LABEL org.opencontainers.image.revision="1"
LABEL org.opencontainers.image.licenses="ISC"
WORKDIR /app

RUN apk add --no-cache --update \
	bash \
	curl \
	unzip \
	postgresql-client \
	moreutils
ADD 'https://github.com/johnkerl/miller/releases/download/v5.10.2/mlr.linux.x86_64' /usr/bin/mlr
RUN chmod +x /usr/bin/mlr

ADD package.json package-lock.json /app/
RUN npm ci && npm cache clean --force

WORKDIR /app

ADD . /app

EXPOSE 3000
ENV PORT 3000

CMD ["node", "index.js"]
