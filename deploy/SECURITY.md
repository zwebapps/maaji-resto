# Edge and server security (no CDN)

This restaurant runs on its own IONOS VPS pair (app + database) with **no
Cloudflare or other CDN in front**. Everything a CDN would add has to live on
the boxes themselves. The layers, outside in:

| Layer | Where | What it does |
|---|---|---|
| Host firewall | `ufw` on each VPS (`deploy/harden-server.sh`) | App VPS: only 22, 80, 443 (tcp) and 443/udp. DB VPS: only 22, and 5432 from the app VPS's IP. Everything else is dropped. |
| SSH | `/etc/ssh/sshd_config.d/10-hardening.conf` | Keys only, no passwords; root by key only; 4 tries per connection. |
| Brute-force bans | fail2ban (`sshd` + `recidive`) | 5 failed SSH logins in 10 min → 1 h ban; banned 3× in a day → 1 week. |
| Patching | unattended-upgrades | Ubuntu security updates installed daily (no automatic reboot). |
| WAF | Coraza + OWASP Core Rule Set in Caddy (`deploy/caddy/Dockerfile`, `deploy/Caddyfile`) | Inspects every dynamic request for SQL injection, XSS, path traversal, scanners, etc. |
| Edge rate limits | `rate_limit` in Caddy | Per IP: logins 20/min, emailed codes & password resets 20/10 min, code checks 30/10 min, order/booking posts 30/min → 429. |
| App | `next.config.ts`, `src/lib/rate-limit.ts` | Security headers (HSTS, CSP, …), the app's own Redis rate limits, auth. |
| Database | `pg_hba.conf` + ufw | Postgres accepts only the app VPS's IP, scram-sha-256. |

Dozzle (`/logs`) has its own login; `LOGS_ALLOW_IPS` in `prod.env` can
restrict it further to fixed IPs.

## Server hardening

```bash
sudo ./deploy/harden-server.sh check                  # report only
sudo ./deploy/harden-server.sh app                    # app VPS
sudo ./deploy/harden-server.sh db <APP_SERVER_IP>     # database VPS
```

Idempotent. It allows SSH before enabling ufw, and refuses to switch sshd to
key-only when no authorized key exists, so it cannot lock you out. Applied to
all four servers (Maaji + Rangla, app + DB) on 2026-11-27.

Docker caveat: ports a container **publishes** bypass ufw. Compose publishes
only Caddy's 80/443; never add `ports:` to app, redis or dozzle.

## Turning the WAF on

The WAF ships in **`WAF_MODE=DetectionOnly`**: it logs what it would block and
blocks nothing, so a false positive can't break ordering.

1. After a release, watch Caddy's log for a few days of normal traffic
   (Dozzle → caddy, or `docker compose … logs caddy | grep '"transaction"'`).
   Each entry names the rule id (e.g. `942100` = SQL injection) and the path.
2. Hits from real guests on real pages (a dish note, an address, the staff
   menu editor) are false positives: exclude that rule for that path in the
   `directives` block, e.g.
   `SecRule REQUEST_URI "@beginsWith /api/staff/menu" "id:1001,phase:1,pass,nolog,ctl:ruleRemoveById=942100"`
   (place it before `Include @owasp_crs/*.conf`).
3. When only attacks/scanners remain, set `WAF_MODE=On` in `prod.env` and run
   `./deploy/deploy.sh up`. Blocked requests get 403.

Payment webhooks (Stripe, PayPal) and static files are not inspected: the
providers sign their bodies and the app verifies the signature.

## Updating Caddy or the modules

Versions are pinned in `deploy/caddy/Dockerfile`. To bump: change them, run
`./deploy/deploy.sh build` on the VPS, and `deploy.sh up` validates the
Caddyfile with the new image before anything is replaced (a failed validate
aborts the release and leaves the running Caddy untouched).

## If you ever add a CDN/proxy

Configure Caddy's `trusted_proxies` first. Otherwise every guest appears to
come from the proxy's IP and they all share one rate-limit bucket.

## Not covered

- **Volumetric DDoS.** A single VPS can't absorb a large flood; IONOS's basic
  network filtering is the only protection. If that becomes a real risk, put
  an EU CDN/WAF in front (e.g. Bunny.net Shield; Myra or Link11 for German
  enterprise-grade) — and see "If you ever add a CDN/proxy".
