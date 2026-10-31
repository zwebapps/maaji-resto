#!/usr/bin/env bash
# Rebuilds the LOCAL Maaji restaurant from nothing, in one go:
#
#   scripts/setup-maaji-local.sh
#
#   migrations → menu templates → restaurant + owner → operator login
#   → Maaji theme, logo and Rangla's appearance options
#   → Rangla's LIVE menu, photos and translations (public site, read-only)
#   → hours, ordering, loyalty and gift-card settings → the Pakoras offer
#
# Safe to re-run: every seed is idempotent, settings are overwritten with
# the same values, and the menu copy publishes a fresh version.
#
# Needs: the maaji-* containers up (.env points at them) and, for the menu,
# Rangla's local checkout + database (RANGLA_DIR, default ../rangla-punjab-resturant).
# Rangla is only ever READ. Production does not use this script — see
# deploy/setup-db.sh.
set -euo pipefail
cd "$(dirname "$0")/.."

RANGLA_DIR="${RANGLA_DIR:-../rangla-punjab-resturant}"
SLUG="maaji-restaurant"
run() { pnpm exec tsx --env-file=.env "$@"; }
psql_maaji() {
  docker exec -i maaji-postgres psql -U maaji_user -d maaji-restaurant -v ON_ERROR_STOP=1 -Atq "$@"
}

echo "→ migrations"
pnpm exec prisma migrate deploy >/dev/null
pnpm exec prisma generate >/dev/null

echo "→ seeds (templates, restaurant + owner, operator)"
run scripts/seed-menu-templates.ts | tail -1
run scripts/seed-restaurant.ts | tail -1
run scripts/seed-platform-admin.ts | tail -1

echo "→ logo"
run scripts/set-venue-logo.ts "$SLUG" public/brand/maaji-logo.png | grep -E "stored|size" || true

echo "→ theme, appearance, contact, hours, ordering, loyalty, gift cards"
psql_maaji <<SQL
UPDATE venues SET
  branding = branding || '{
    "theme": "maaji-emerald", "texture": "jali", "backdrop": "none",
    "primaryColor": "#0f4a47", "headingColor": "#e0b458",
    "kiosk": "lg", "navLayout": "side", "cardBorders": "on",
    "halalFilter": "on", "categoryIcons": "icons"
  }'::jsonb,
  timezone = 'Europe/Berlin',
  hours = '{"configured": true, "days": {
    "mon": {"closed": false, "slots": [{"open": "11:00", "close": "14:00"}, {"open": "17:00", "close": "22:00"}]},
    "tue": {"closed": false, "slots": [{"open": "11:00", "close": "14:00"}, {"open": "17:00", "close": "22:00"}]},
    "wed": {"closed": false, "slots": [{"open": "11:00", "close": "14:00"}, {"open": "17:00", "close": "22:00"}]},
    "thu": {"closed": false, "slots": [{"open": "11:00", "close": "14:00"}, {"open": "17:00", "close": "22:00"}]},
    "fri": {"closed": false, "slots": [{"open": "11:00", "close": "14:00"}, {"open": "17:00", "close": "22:00"}]},
    "sat": {"closed": false, "slots": [{"open": "11:00", "close": "14:00"}, {"open": "17:00", "close": "22:00"}]},
    "sun": {"closed": false, "slots": [{"open": "11:00", "close": "14:00"}, {"open": "17:00", "close": "22:00"}]}
  }}'::jsonb,
  ordering = '{"dineIn": true, "delivery": true, "takeaway": true, "pausedUntil": null,
    "deliveryZips": [], "notifyEmails": [], "reservations": true,
    "deliveryAreas": [{"zip": "79114", "feeCents": 0, "locality": "Freiburg", "minCents": 0, "freeOverCents": 0}, {"zip": "79110", "feeCents": 0, "locality": "Freiburg", "minCents": 0, "freeOverCents": 0}, {"zip": "79111", "feeCents": 0, "locality": "Freiburg", "minCents": 0, "freeOverCents": 0}, {"zip": "79106", "feeCents": 0, "locality": "Freiburg", "minCents": 0, "freeOverCents": 0}],
    "acceptedPayments": ["cash", "girocard", "visa", "mastercard"], "appCancelEnabled": false,
    "deliveryFeeCents": 0, "deliveryMinCents": 0, "etaAcceptSeconds": 30, "etaPickupMinutes": 20,
    "issueWindowHours": 3, "cashCancelMinutes": 10, "etaDeliveryMinutes": 50, "orderDiscountPercent": 0}'::jsonb,
  loyalty = '{"enabled": true, "rewardPoints": 100, "minOrderCents": 2000, "pointsPerOrder": 5,
    "rewardValueCents": 2000, "voucherExpiryMonths": 0}'::jsonb,
  gift_cards = '{"enabled": true, "expiryMonths": 36}'::jsonb,
  contact = '{"landline": "+4976151466424", "email": "gw5dqcto@kontakt-ordersmart.de",
    "address": "Sundgauallee 49\n79114 Freiburg im Breisgau"}'::jsonb,
  "updatedAt" = now()
WHERE slug = '$SLUG';
SQL

echo "→ menu, photos and translations from Rangla's LIVE site (public, read-only)"
# The live public menu lists only today's dishes, so the weekday Thali is
# carried over from the menu already here (first run: copy it from Rangla's
# local database with scripts/copy-menu-from-venue.ts beforehand).
SOURCE_URL="${SOURCE_URL:-https://rangla-punjab-restaurant.de}" TARGET_SLUG="$SLUG" KEEP_CATEGORIES="Thali" \
  run scripts/import-menu-from-live-site.ts

if [ -f release/rangla-staff-menu.json ]; then
  echo "→ Thali from Rangla's staff menu (python3 scripts/fetch-staff-menu.py)"
  STAFF_MENU_FILE=release/rangla-staff-menu.json CATEGORY=Thali TARGET_SLUG="$SLUG" \
    run scripts/apply-staff-menu-category.ts
fi

echo "→ offer: Pakoras 6,90 → 4,90 € (open-ended)"
psql_maaji <<SQL
UPDATE items i SET offer_price_cents = 490, offer_starts_at = NULL, offer_ends_at = NULL,
       offer_weekly = NULL, "updatedAt" = now()
  FROM categories c, menus m, venues v
 WHERE c.id = i.category_id AND m.published_version = c.menu_version_id
   AND v.id = m.venue_id AND v.slug = '$SLUG' AND i.name = '1. Pakoras';
SQL

echo "✓ Maaji is set up locally: $(psql_maaji -c "SELECT count(*) FROM items i JOIN categories c ON c.id = i.category_id JOIN menus m ON m.published_version = c.menu_version_id") dishes live"
