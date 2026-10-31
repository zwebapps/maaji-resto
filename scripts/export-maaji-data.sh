#!/usr/bin/env bash
# Packs the LOCAL Maaji restaurant for production, in two files:
#
#   scripts/export-maaji-data.sh            → release/maaji.dump
#                                              release/maaji-uploads.tgz
#
#   maaji.dump         the whole database (menu, photos' rows, theme, hours,
#                      ordering, loyalty, gift cards, offers, translations),
#                      pg_dump custom format, without owner/ACL statements.
#                      Login tokens and paired devices are left out.
#   maaji-uploads.tgz  ONLY the photo files the database still points at
#                      (paths relative to public/uploads).
#
# On the servers:
#   DB VPS   sudo ./deploy/setup-db.sh --app-ip <APP_PRIVATE_IP> --restore maaji.dump
#   App VPS  ./deploy/deploy.sh release && ./deploy/deploy.sh uploads maaji-uploads.tgz \
#              && ./deploy/deploy.sh owner
#
# The dump carries the local dev logins; setup-db.sh deletes them on restore,
# and `deploy.sh release` (seed) + `deploy.sh owner` create the real ones
# from prod.env. Never commit release/ — it is ignored.
set -euo pipefail
cd "$(dirname "$0")/.."

CONTAINER="${CONTAINER:-maaji-postgres}"
OWNER="${OWNER:-maaji_user}"
DB="${DB:-maaji-restaurant}"
OUT="${OUT:-release}"
mkdir -p "$OUT"

psql_db() { docker exec -i "$CONTAINER" psql -U "$OWNER" -d "$DB" -v ON_ERROR_STOP=1 -Atq "$@"; }

venues="$(psql_db -c "SELECT count(*) FROM venues")"
[ "$venues" -ge 1 ] || { echo "✗ no restaurant in $DB — run scripts/setup-maaji-local.sh first"; exit 1; }

echo "→ database dump"
docker exec "$CONTAINER" pg_dump -U "$OWNER" -d "$DB" -Fc --no-owner --no-acl \
  --exclude-table-data=email_verification_tokens \
  --exclude-table-data=password_reset_tokens \
  --exclude-table-data=customer_tokens \
  --exclude-table-data=customer_password_reset_tokens \
  --exclude-table-data=staff_devices \
  > "$OUT/maaji.dump"

echo "→ photos the database uses"
psql_db -c "SELECT storage_key FROM media WHERE \"deletedAt\" IS NULL" > "$OUT/.upload-keys"
missing=0
: > "$OUT/.upload-list"
while read -r key; do
  [ -n "$key" ] || continue
  if [ -f "public/uploads/$key" ]; then echo "$key" >> "$OUT/.upload-list"; else missing=$((missing + 1)); fi
done < "$OUT/.upload-keys"
tar -czf "$OUT/maaji-uploads.tgz" -C public/uploads -T "$OUT/.upload-list"
rm -f "$OUT/.upload-keys" "$OUT/.upload-list"

echo "✓ $OUT/maaji.dump ($(du -h "$OUT/maaji.dump" | cut -f1)) · $OUT/maaji-uploads.tgz ($(du -h "$OUT/maaji-uploads.tgz" | cut -f1)), $missing missing photo file(s)"
echo "  copy both to the servers, e.g.  scp $OUT/maaji.dump <db-vps>:  &&  scp $OUT/maaji-uploads.tgz <app-vps>:<repo>/"
