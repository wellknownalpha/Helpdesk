#!/bin/sh
set -eu

echo "Building and recreating ExclDesk..."
if [ -f .env ] && grep -Eiq '^[[:space:]]*MAIL_INBOUND_ENABLED[[:space:]]*=[[:space:]]*"?true"?([[:space:]]*(#.*)?)?$' .env; then
  echo "Inbound email is enabled; rebuilding and starting the IMAP poller..."
  docker compose --profile mail build app poller
  docker compose --profile mail up -d --force-recreate app poller
else
  docker compose build app
  docker compose up -d --force-recreate app
fi

echo "Waiting for the application health check..."
attempt=1
while [ "$attempt" -le 30 ]; do
  if curl --fail --silent --show-error http://localhost:3002/api/health >/dev/null; then
    if [ -f .env ] && grep -Eiq '^[[:space:]]*MAIL_INBOUND_ENABLED[[:space:]]*=[[:space:]]*"?true"?([[:space:]]*(#.*)?)?$' .env; then
      poller_attempt=1
      while [ "$poller_attempt" -le 30 ]; do
        if docker compose --profile mail logs --no-color poller 2>/dev/null | grep -Fq "[poller] watching "; then
          break
        fi
        if ! docker compose --profile mail ps --status running -q poller | grep -q .; then
          break
        fi
        poller_attempt=$((poller_attempt + 1))
        sleep 2
      done
      if ! docker compose --profile mail logs --no-color poller 2>/dev/null | grep -Fq "[poller] watching "; then
        echo "IMAP poller failed to connect. Recent poller logs:"
        docker compose --profile mail logs --tail=80 poller
        exit 1
      fi
    fi
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