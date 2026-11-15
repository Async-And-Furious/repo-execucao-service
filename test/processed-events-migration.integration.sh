#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
migration="$root/prisma/migrations/20261103000000_drop_empty_processed_events/migration.sql"
initial="$root/prisma/migrations/20261002000000_init/migration.sql"
suffix="$(date +%s)_${RANDOM}_$$"
container="pr4-processed-events-${suffix}"
volume="pr4-processed-events-data-${suffix}"
tmp="$(mktemp -d /tmp/opencode/pr4-migration-evidence.XXXXXX)"
volume_created=false
container_started=false

cleanup() {
  if [[ "$container_started" == true ]]; then docker rm -f "$container" >/dev/null; fi
  if [[ "$volume_created" == true ]]; then docker volume rm "$volume" >/dev/null; fi
  rm -rf -- "$tmp"
}
trap cleanup EXIT

command -v docker >/dev/null
command -v psql >/dev/null
command -v pnpm >/dev/null
if docker container inspect "$container" >/dev/null 2>&1; then
  echo "Refusing to reuse existing container name: $container" >&2
  exit 1
fi
if docker volume inspect "$volume" >/dev/null 2>&1; then
  echo "Refusing to reuse existing volume name: $volume" >&2
  exit 1
fi

docker volume create "$volume" >/dev/null
volume_created=true
docker run --detach --rm --name "$container" \
  --env POSTGRES_USER=postgres \
  --env POSTGRES_PASSWORD=local-disposable-only \
  --env POSTGRES_DB=postgres \
  --publish 127.0.0.1::5432 \
  --mount "type=volume,src=$volume,dst=/var/lib/postgresql/data" \
  postgres:16-alpine >/dev/null
container_started=true

port="$(docker port "$container" 5432/tcp)"
port="${port##*:}"
admin_url="postgresql://postgres:local-disposable-only@127.0.0.1:${port}/postgres"
ready=false
for _ in $(seq 1 60); do
  if psql "$admin_url" -v ON_ERROR_STOP=1 -Atc 'SELECT 1' >/dev/null 2>&1; then
    ready=true
    break
  fi
  sleep 1
done
[[ "$ready" == true ]] || { echo 'Disposable PostgreSQL did not become ready in 60s' >&2; exit 1; }

echo "MIGRATION_SHA256=$(sha256sum "$migration" | cut -d' ' -f1)"

# Case 1: Prisma history deploys on an empty DB and removes the empty legacy table.
psql "$admin_url" -v ON_ERROR_STOP=1 -c 'CREATE DATABASE pr4_main' >/dev/null
main_url="postgresql://postgres:local-disposable-only@127.0.0.1:${port}/pr4_main"
DATABASE_URL="${main_url}?schema=public" pnpm --dir "$root" exec prisma migrate deploy
[[ "$(psql "$main_url" -v ON_ERROR_STOP=1 -Atc "SELECT to_regclass('public.processed_events') IS NULL")" == t ]]

# Case 2: absent table remains absent after repeated runs.
psql "$admin_url" -v ON_ERROR_STOP=1 -c 'CREATE DATABASE pr4_absent' >/dev/null
absent_url="postgresql://postgres:local-disposable-only@127.0.0.1:${port}/pr4_absent"
psql "$absent_url" -v ON_ERROR_STOP=1 -f "$migration" >"$tmp/absent-1.log"
psql "$absent_url" -v ON_ERROR_STOP=1 -f "$migration" >"$tmp/absent-2.log"
[[ "$(psql "$absent_url" -v ON_ERROR_STOP=1 -Atc "SELECT to_regclass('public.processed_events') IS NULL")" == t ]]

# Case 3: non-empty table fails safely and retains the row.
psql "$admin_url" -v ON_ERROR_STOP=1 -c 'CREATE DATABASE pr4_occupied' >/dev/null
occupied_url="postgresql://postgres:local-disposable-only@127.0.0.1:${port}/pr4_occupied"
psql "$occupied_url" -v ON_ERROR_STOP=1 -f "$initial" >/dev/null
psql "$occupied_url" -v ON_ERROR_STOP=1 -c "INSERT INTO processed_events(event_id) VALUES ('fixture-only')" >/dev/null
if psql "$occupied_url" -v ON_ERROR_STOP=1 -f "$migration" >"$tmp/occupied.log" 2>&1; then
  echo 'Expected populated-table migration to fail, but it succeeded' >&2
  exit 1
fi
if ! grep -Fq 'Refusing to drop public.processed_events: table contains data' "$tmp/occupied.log"; then
  echo 'Populated-table case failed for an unexpected reason:' >&2
  cat "$tmp/occupied.log" >&2
  exit 1
fi
[[ "$(psql "$occupied_url" -v ON_ERROR_STOP=1 -Atc 'SELECT count(*) FROM processed_events')" == 1 ]]
[[ "$(psql "$occupied_url" -v ON_ERROR_STOP=1 -Atc "SELECT to_regclass('public.processed_events') IS NOT NULL")" == t ]]

# Case 4: RESTRICT fails safely and retains both table and dependent view.
psql "$admin_url" -v ON_ERROR_STOP=1 -c 'CREATE DATABASE pr4_dependency' >/dev/null
dependency_url="postgresql://postgres:local-disposable-only@127.0.0.1:${port}/pr4_dependency"
psql "$dependency_url" -v ON_ERROR_STOP=1 -f "$initial" >/dev/null
psql "$dependency_url" -v ON_ERROR_STOP=1 -c \
  'CREATE VIEW processed_events_ref AS SELECT event_id FROM processed_events' >/dev/null
if psql "$dependency_url" -v ON_ERROR_STOP=1 -f "$migration" >"$tmp/dependency.log" 2>&1; then
  echo 'Expected dependent-object migration to fail, but it succeeded' >&2
  exit 1
fi
if ! grep -Fq 'cannot drop table processed_events because other objects depend on it' "$tmp/dependency.log"; then
  echo 'Dependency case failed for an unexpected reason:' >&2
  cat "$tmp/dependency.log" >&2
  exit 1
fi
[[ "$(psql "$dependency_url" -v ON_ERROR_STOP=1 -Atc \
  "SELECT to_regclass('public.processed_events') IS NOT NULL AND to_regclass('public.processed_events_ref') IS NOT NULL")" == t ]]

echo 'PASS 1: Prisma history removes empty processed_events'
echo 'PASS 2: absent table is idempotent on repeated migration runs'
echo 'PASS 3: populated-table error leaves table and row intact'
echo 'PASS 4: dependency error leaves table and dependent view intact'
