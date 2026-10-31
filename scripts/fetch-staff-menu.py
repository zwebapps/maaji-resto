#!/usr/bin/env python3
"""Save another resto deployment's full STAFF menu (every dish, every serving
day, live photo URLs) to release/<name>-staff-menu.json, for
scripts/apply-staff-menu-category.ts.

    python3 scripts/fetch-staff-menu.py
    python3 scripts/fetch-staff-menu.py https://rangla-punjab-restaurant.de rangla

Asks for that restaurant's OWNER login (password hidden, never stored). It
signs in, reads GET /api/v1/staff/menu once and writes nothing on the site;
the session value it gets back is only held in memory and dropped on exit.
"""
import getpass
import json
import os
import sys
import urllib.error
import urllib.request

base = (sys.argv[1] if len(sys.argv) > 1 else "https://rangla-punjab-restaurant.de").rstrip("/")
name = sys.argv[2] if len(sys.argv) > 2 else "rangla"
out = os.path.join(os.path.dirname(__file__), "..", "release", f"{name}-staff-menu.json")

email = input(f"{base} owner email: ").strip()
password = getpass.getpass("Owner password (hidden): ")

req = urllib.request.Request(
    base + "/api/auth/customer/login",
    method="POST",
    data=json.dumps({"email": email, "password": password}).encode(),
    headers={"content-type": "application/json"},
)
try:
    login = json.load(urllib.request.urlopen(req))
except urllib.error.HTTPError as e:
    sys.exit(f"✗ login refused ({e.code}) — check the email and password")
finally:
    password = None
if login.get("kind") != "restaurant":
    sys.exit(f"✗ that is not the restaurant owner login (kind={login.get('kind')})")

menu = urllib.request.urlopen(
    urllib.request.Request(base + "/api/v1/staff/menu", headers={"x-staff-token": login["token"]})
)
data = json.load(menu)
os.makedirs(os.path.dirname(out), exist_ok=True)
with open(out, "w") as f:
    json.dump(data, f, ensure_ascii=False)
cats = {c["name"]: len(c["items"]) for c in data.get("categories", [])}
print(f"✓ saved {os.path.normpath(out)} — {len(cats)} categories; Thali: {cats.get('Thali', 'NOT FOUND')}")
