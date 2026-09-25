#!/bin/sh
# ExclDesk container entrypoint:
# 1. wait for Postgres, 2. apply migrations, 3. seed only if DB is empty, 4. start.
set -e

echo "[excldesk] Waiting for database..."
for i in $(seq 1 30); do
  if npx prisma migrate deploy >/tmp/migrate.log 2>&1; then
    cat /tmp/migrate.log
    break
  fi
  if [ "$i" -eq 30 ]; then
    echo "[excldesk] Database never became ready. Last migrate output:"
    cat /tmp/migrate.log
    exit 1
  fi
  echo "[excldesk] DB not ready yet (attempt $i/30)..."
  sleep 2
done

echo "[excldesk] Checking seed status..."
node scripts/seed-if-empty.mjs || echo "[excldesk] WARNING: seed check failed, continuing anyway."

echo "[excldesk] Starting app on :3000 ..."
exec npx next start -H 0.0.0.0 -p 3000
