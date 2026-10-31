#!/usr/bin/env bash
# Creates the local TEST database the vitest suite runs against, shaped
# like CI's: migrations as the owner role, the app as the non-superuser
# `elvoria_app` — so row-level security actually scopes every query and a
# suite's cleanup can only ever delete its own fixtures.
#
#   scripts/setup-test-db.sh         # once; re-run after `docker volume rm`
#
# Then .env needs (the script prints them):
#   TEST_DATABASE_URL=…/maaji-test   TEST_APP_DATABASE_URL=…elvoria_app…/maaji-test
#
# vitest.setup.ts refuses to run against any database whose name does not
# say "test", so the dev database can never be wiped by a test run again.
set -euo pipefail
cd "$(dirname "$0")/.."

CONTAINER="${CONTAINER:-maaji-postgres}"
OWNER="${OWNER:-maaji_user}"
TEST_DB="${TEST_DB:-maaji-test}"
APP_PW="${APP_PW:-elvoria_app_dev}"   # local-only, matches CI
sq() { docker exec -i "$CONTAINER" psql -U "$OWNER" -d postgres -v ON_ERROR_STOP=1 -Atq "$@"; }

sq -c "SELECT 1 FROM pg_database WHERE datname = '$TEST_DB'" | grep -q 1 \
  || sq -c "CREATE DATABASE \"$TEST_DB\""
# Roles are cluster-wide. elvoria_app gets a LOGIN here (CI's app role);
# historical migrations also grant to `elvoria`.
sq <<SQL
DO \$\$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'elvoria_app') THEN
    CREATE ROLE elvoria_app LOGIN PASSWORD '$APP_PW';
  ELSE
    ALTER ROLE elvoria_app LOGIN PASSWORD '$APP_PW';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'elvoria') THEN
    CREATE ROLE elvoria NOLOGIN;
  END IF;
END \$\$;
SQL
docker exec -i "$CONTAINER" psql -U "$OWNER" -d "$TEST_DB" -v ON_ERROR_STOP=1 -Atq <<SQL
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
CREATE EXTENSION IF NOT EXISTS citext;
SQL

PORT="$(docker port "$CONTAINER" 5432/tcp | head -1 | sed 's/.*://')"
OWNER_URL="$(grep -E '^DATABASE_URL=' .env | cut -d= -f2- | tr -d '"' | sed -E "s#/[^/?]+\?#/$TEST_DB?#")"
APP_URL_TEST="postgresql://elvoria_app:$APP_PW@localhost:$PORT/$TEST_DB?schema=public"
DATABASE_URL="$OWNER_URL" pnpm exec prisma migrate deploy >/dev/null
# Table-level grants for the app role — what CI runs right after migrating.
docker exec -i "$CONTAINER" psql -U "$OWNER" -d "$TEST_DB" -v ON_ERROR_STOP=1 -q < prisma/dev-roles.sql
# Monthly partitions for this month and the next ones — what the app does
# at boot (instrumentation.ts). Migrations alone stop at an old month.
DATABASE_URL="$OWNER_URL" pnpm exec tsx scripts/maintain-partitions.ts

echo "✓ $TEST_DB ready. In .env:"
echo "TEST_DATABASE_URL=\"$OWNER_URL\""
echo "TEST_APP_DATABASE_URL=\"$APP_URL_TEST\""
