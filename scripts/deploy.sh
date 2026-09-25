#!/bin/sh
set -eu

echo "Building and recreating ExclDesk..."
docker compose build --pull app
docker compose up -d --force-recreate app

if [ -n "$(docker compose ps -q poller)" ]; then
  docker compose --profile mail build --pull poller
  docker compose --profile mail up -d --force-recreate poller
fi

echo "Waiting for the application health check..."
attempt=1
while [ "$attempt" -le 30 ]; do
  if curl --fail --silent --show-error http://localhost:3002/api/health >/dev/null; then
    echo "Deployment is healthy: http://localhost:3002"
    docker compose ps app
    exit 0
  fi
  attempt=$((attempt + 1))
  sleep 2
done

echo "Deployment failed health verification. Recent app logs:"
docker compose logs --tail=80 app
exit 1