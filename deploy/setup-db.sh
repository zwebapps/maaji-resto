#!/usr/bin/env bash
# One command that makes a production PostgreSQL ready for Maaji.
# Run it as root on the machine that will hold the database (Debian/Ubuntu):
#
#   # database on its OWN VPS, reached over the private network:
#   sudo ./deploy/setup-db.sh --app-ip 10.0.0.1 --db-ip 10.0.0.2 --restore maaji.dump
#
#   # database on the SAME VPS as the app, app running in Docker:
#   sudo ./deploy/setup-db.sh --app-ip local --restore maaji.dump
#
#   # database on the SAME VPS as the app, app running natively (no Docker):
#   sudo ./deploy/setup-db.sh --app-ip localhost --restore maaji.dump
#
# What it does (idempotent — safe to re-run; it never drops anything):
#   1. installs PostgreSQL 16 (+ the PGDG repo when the OS lacks 16)
#   2. listens only where the app can reach it — localhost + the private IP,
#      or the Docker bridge for --app-ip local — never the public internet;
#      pg_hba lets in ONLY the app (scram-sha-256); pg_stat_statements on
#   3. creates the database + its owner role (BYPASSRLS — see step 3) with a
#      generated HEX password,
#      plus the two NOLOGIN roles historical migrations GRANT to
#      (elvoria_app, elvoria) — without them `migrate deploy` aborts
#   4. --restore FILE: loads a dump made by scripts/export-maaji-data.sh
#      (menu, photos' rows, theme, hours, …) into the EMPTY database and
#      deletes the local dev logins it carries
#   5. nightly local pg_dump to /var/backups/maaji (7 days kept)
#   6. prints the exact prod.env lines for the app VPS
#
# Without --restore the database is left empty: `./deploy/deploy.sh release`
# on the app VPS migrates it and seeds a starter restaurant.
#
# Options: --db-name (maaji_database) --db-user (maaji_user)
#          DB_OWNER_PASSWORD=… in the environment reuses a password instead
#          of generating one (needed when re-running after prod.env is set).
set -euo pipefail

APP_IP="" DB_IP="" RESTORE="" DB_NAME="maaji_database" DB_USER="maaji_user"
while [ $# -gt 0 ]; do
  case "$1" in
    --app-ip) APP_IP="$2"; shift 2 ;;
    --db-ip) DB_IP="$2"; shift 2 ;;
    --restore) RESTORE="$2"; shift 2 ;;
    --db-name) DB_NAME="$2"; shift 2 ;;
    --db-user) DB_USER="$2"; shift 2 ;;
    -h|--help) sed -n '2,32p' "$0"; exit 0 ;;
    *) echo "unknown option: $1 (see --help)"; exit 1 ;;
  esac
done

die() { echo "✗ $*" >&2; exit 1; }
[ "$(id -u)" -eq 0 ] || die "run as root (sudo)"
[ -n "$APP_IP" ] || die "--app-ip is required: the app VPS's private IP, 'local' (app in Docker here) or 'localhost' (app native here)"
[[ "$DB_NAME" =~ ^[a-z_][a-z0-9_]*$ && "$DB_USER" =~ ^[a-z_][a-z0-9_]*$ ]] \
  || die "--db-name/--db-user: lowercase letters, digits and _ only"
if [ "$APP_IP" != "local" ] && [ "$APP_IP" != "localhost" ]; then
  [[ "$APP_IP" =~ ^[0-9.]+$ ]] || die "--app-ip must be an IPv4 address, 'local' or 'localhost'"
  [ -n "$DB_IP" ] || die "--db-ip (this server's private IP) is required with a remote --app-ip"
fi
if [ -n "${DB_OWNER_PASSWORD:-}" ]; then
  [[ "$DB_OWNER_PASSWORD" =~ ^[A-Za-z0-9]{16,}$ ]] \
    || die "DB_OWNER_PASSWORD: 16+ letters/digits only (it goes into a URL) — use: openssl rand -hex 24"
fi
if [ -n "$RESTORE" ]; then
  [ -f "$RESTORE" ] || die "--restore: $RESTORE not found"
  RESTORE="$(cd "$(dirname "$RESTORE")" && pwd)/$(basename "$RESTORE")"
fi

PGV=16
as_pg() { sudo -u postgres "$@"; }
sql() { as_pg psql -v ON_ERROR_STOP=1 -Atq "$@"; }

# ── 1. PostgreSQL 16 ────────────────────────────────────────────────────
if ! command -v "/usr/lib/postgresql/$PGV/bin/postgres" >/dev/null 2>&1; then
  echo "→ installing PostgreSQL $PGV"
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -qq
  if ! apt-cache show "postgresql-$PGV" >/dev/null 2>&1; then
    apt-get install -y -qq postgresql-common ca-certificates >/dev/null
    /usr/share/postgresql-common/pgdg/apt.postgresql.org.sh -y >/dev/null
  fi
  apt-get install -y -qq "postgresql-$PGV" "postgresql-contrib-$PGV" >/dev/null
fi
CONF_DIR="/etc/postgresql/$PGV/main"
[ -d "$CONF_DIR" ] || die "no cluster at $CONF_DIR"

# ── 2. Network + monitoring ─────────────────────────────────────────────
if [ "$APP_IP" = "localhost" ]; then
  # The app runs natively on this host: nothing but loopback ever connects.
  LISTEN="localhost"
  ALLOW="127.0.0.1/32"
  DB_HOST_FOR_APP="127.0.0.1"
elif [ "$APP_IP" = "local" ]; then
  # The app runs in Docker on this host. Containers reach the host on the
  # docker0 bridge address; Compose networks live inside 172.16.0.0/12.
  command -v docker >/dev/null || die "--app-ip local needs Docker installed first (the app runs in it)"
  BRIDGE_IP="$(ip -4 addr show docker0 2>/dev/null | awk '/inet /{print $2}' | cut -d/ -f1)"
  [ -n "$BRIDGE_IP" ] || die "docker0 has no IPv4 address — is Docker running?"
  LISTEN="localhost, $BRIDGE_IP"
  ALLOW="172.16.0.0/12"
  DB_HOST_FOR_APP="$BRIDGE_IP"
else
  LISTEN="localhost, $DB_IP"
  ALLOW="$APP_IP/32"
  DB_HOST_FOR_APP="$DB_IP"
fi
mkdir -p "$CONF_DIR/conf.d"
cat > "$CONF_DIR/conf.d/maaji.conf" <<CONF
# Written by deploy/setup-db.sh — re-run it rather than editing by hand.
listen_addresses = '$LISTEN'
shared_preload_libraries = 'pg_stat_statements'
max_connections = 100
password_encryption = 'scram-sha-256'
CONF
HBA="$CONF_DIR/pg_hba.conf"
HBA_LINE="host  $DB_NAME  $DB_USER  $ALLOW  scram-sha-256"
sed -i '/# maaji: app access (setup-db.sh)/,/# maaji: end/d' "$HBA"
{
  echo "# maaji: app access (setup-db.sh)"
  echo "$HBA_LINE"
  [ "$APP_IP" = "localhost" ] && echo "host  $DB_NAME  $DB_USER  ::1/128  scram-sha-256"
  echo "# maaji: end"
} >> "$HBA"
systemctl restart postgresql
systemctl enable postgresql >/dev/null 2>&1 || true

if [ "$APP_IP" != "localhost" ] && command -v ufw >/dev/null && ufw status | grep -q "Status: active"; then
  if [ "$APP_IP" = "local" ]; then ufw allow from 172.16.0.0/12 to any port 5432 proto tcp >/dev/null
  else ufw allow from "$APP_IP" to any port 5432 proto tcp >/dev/null; fi
fi

# ── 3. Database + roles ─────────────────────────────────────────────────
if sql -c "SELECT 1 FROM pg_roles WHERE rolname = '$DB_USER'" | grep -q 1; then
  if [ -n "${DB_OWNER_PASSWORD:-}" ]; then
    PASS="$DB_OWNER_PASSWORD"
    sql -c "ALTER ROLE $DB_USER LOGIN PASSWORD '$PASS'"
  else
    PASS="(unchanged — the one already in prod.env)"
  fi
else
  PASS="${DB_OWNER_PASSWORD:-$(openssl rand -hex 24)}"
  sql -c "CREATE ROLE $DB_USER LOGIN PASSWORD '$PASS'"
fi
# BYPASSRLS: every tenant table FORCEs row-level security keyed on a
# per-request GUC, and that binds the table owner too. The app sets the GUC,
# but the SECURITY DEFINER lookup `resolve_public_venue` (owned by this role)
# and the seed/owner scripts run without one — as a plain owner they see no
# restaurant and the site serves nothing. A single-restaurant deployment
# has exactly one tenant, so there is nothing for RLS to keep apart.
# (Rehearsed 2026-10-31 on a restored dump: without it 0 rows, with it OK.)
sql -c "ALTER ROLE $DB_USER BYPASSRLS"
sql -c "SELECT 1 FROM pg_database WHERE datname = '$DB_NAME'" | grep -q 1 \
  || sql -c "CREATE DATABASE $DB_NAME OWNER $DB_USER"
sql <<SQL
DO \$\$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'elvoria_app') THEN CREATE ROLE elvoria_app NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'elvoria') THEN CREATE ROLE elvoria NOLOGIN; END IF;
END \$\$;
SQL

# Extensions need a superuser (pg_stat_statements is not "trusted"), so
# they are created here as postgres — before migrations or a restore.
sql -d "$DB_NAME" -c "CREATE EXTENSION IF NOT EXISTS pg_stat_statements; CREATE EXTENSION IF NOT EXISTS citext;"

# ── 4. Restore ──────────────────────────────────────────────────────────
if [ -n "$RESTORE" ]; then
  if sql -d "$DB_NAME" -c "SELECT to_regclass('public.venues') IS NOT NULL" | grep -q t; then
    echo "→ $DB_NAME already holds the app's tables — NOT restoring over live data (drop it by hand if you really mean to)"
  else
    echo "→ restoring $(basename "$RESTORE") into $DB_NAME"
    WORK="$(mktemp -d)" && chown postgres "$WORK"
    cp "$RESTORE" "$WORK/maaji.dump" && chown postgres "$WORK/maaji.dump"
    # Everything but the extensions (created above as postgres), restored AS
    # the owner role so every table, sequence and function belongs to it.
    as_pg sh -c "pg_restore -l '$WORK/maaji.dump' | grep -vE ' EXTENSION | COMMENT - EXTENSION ' > '$WORK/maaji.list'"
    as_pg pg_restore -d "$DB_NAME" --no-owner --no-acl --role="$DB_USER" --exit-on-error \
      -L "$WORK/maaji.list" "$WORK/maaji.dump"
    rm -rf "$WORK"
    # The dump comes from a developer machine: its logins are dev logins.
    # Drop every staff/admin login that is not the restaurant's owner; the
    # owner is renamed and re-passworded by `deploy.sh owner`, the operator
    # is created by `deploy.sh release` (seed) from prod.env.
    sql -d "$DB_NAME" <<'SQL'
DELETE FROM users u
 WHERE NOT EXISTS (SELECT 1 FROM memberships m WHERE m.user_id = u.id AND m.role = 'owner');
SQL
    echo "  restored: $(sql -d "$DB_NAME" -c "SELECT count(*) FROM venues") restaurant(s), $(sql -d "$DB_NAME" -c "SELECT count(*) FROM items") dish rows"
  fi
fi

# ── 5. Nightly backups ──────────────────────────────────────────────────
mkdir -p /var/backups/maaji && chown postgres /var/backups/maaji && chmod 700 /var/backups/maaji
cat > /etc/cron.d/maaji-db-backup <<CRON
# Written by deploy/setup-db.sh. Copy these off the machine too (rclone etc.).
15 3 * * * postgres pg_dump -Fc $DB_NAME > /var/backups/maaji/$DB_NAME-\$(date +\%F).dump && find /var/backups/maaji -name '*.dump' -mtime +7 -delete
CRON

# ── 6. What the app VPS needs ───────────────────────────────────────────
as_pg psql -Atq -c "SELECT 1" -d "$DB_NAME" >/dev/null
cat <<OUT

✓ PostgreSQL $PGV is ready for Maaji.
  Put these in prod.env on the app VPS (then chmod 600 prod.env):

DB_HOST=$DB_HOST_FOR_APP
DB_NAME=$DB_NAME
DB_OWNER_USER=$DB_USER
DB_OWNER_PASSWORD=$PASS

  Next, on the app VPS:  ./deploy/deploy.sh release
OUT
[ -n "$RESTORE" ] && echo "                         ./deploy/deploy.sh uploads maaji-uploads.tgz && ./deploy/deploy.sh owner"
exit 0
