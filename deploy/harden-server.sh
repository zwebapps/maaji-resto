#!/usr/bin/env bash
# Host-level hardening for the restaurant's VPSes (there is no cloud
# firewall/CDN in front — this host firewall IS the network edge).
# Idempotent: safe to re-run; `check` only reports.
#
#   sudo ./deploy/harden-server.sh check
#   sudo ./deploy/harden-server.sh app                 # app VPS: 22, 80, 443
#   sudo ./deploy/harden-server.sh db <APP_SERVER_IP>  # DB VPS: 22 + 5432 from the app only
#
# What it sets (see deploy/SECURITY.md):
#   - ufw: deny incoming by default, allow only the role's ports
#   - sshd: keys only (no passwords, root by key only) — refuses to apply
#     if no authorized key exists, so it can't lock you out
#   - fail2ban: sshd jail + recidive (repeat offenders banned for a week)
#   - unattended-upgrades: security updates installed automatically
#
# Docker note: ports a container PUBLISHES bypass ufw (Docker writes its
# own iptables rules). That is why compose publishes only caddy's 80/443
# and nothing else; never add `ports:` to app/redis/dozzle.
set -euo pipefail

ROLE="${1:-}"
[ "$(id -u)" = 0 ] || { echo "run as root (sudo)"; exit 1; }

status() {
  echo "== $(hostname) ($(hostname -I | awk '{print $1}'))"
  echo "-- ufw";            ufw status verbose 2>/dev/null | sed -n '1,4p;/^To/,$p' || echo "ufw not installed"
  echo "-- sshd";           sshd -T 2>/dev/null | grep -E '^(passwordauthentication|kbdinteractiveauthentication|permitrootlogin|pubkeyauthentication) '
  echo "-- fail2ban";       fail2ban-client status 2>/dev/null | tail -1 || echo "fail2ban not running"
  echo "-- auto updates";   systemctl is-active unattended-upgrades 2>/dev/null || true
  echo "-- listening (public)"
  ss -tulnH | awk '{print $1, $5}' | grep -vE ' (127\.|\[::1\]|\[?::ffff:127)' | sort -u
}

case "$ROLE" in
  check) status; exit 0 ;;
  app) ;;
  db)
    APP_IP="${2:-}"
    [[ "$APP_IP" =~ ^[0-9]{1,3}(\.[0-9]{1,3}){3}$ ]] || { echo "usage: $0 db <APP_SERVER_IP>"; exit 1; }
    ;;
  *) echo "usage: $0 {check|app|db <APP_SERVER_IP>}"; exit 1 ;;
esac

export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq ufw fail2ban unattended-upgrades >/dev/null

# --- SSH: keys only -----------------------------------------------------
# Guard: never turn passwords off on a box nobody can reach by key.
# (`|| true`: a missing file must not fail the pipe under pipefail.)
if ! { cat /root/.ssh/authorized_keys /home/*/.ssh/authorized_keys 2>/dev/null || true; } \
    | grep -qE '(^|[ ,"])(ssh-(ed25519|rsa)|ecdsa-sha2-|sk-ssh-|sk-ecdsa-)'; then
  echo "! no authorized SSH key found — NOT changing sshd (add a key first)"
else
  cat > /etc/ssh/sshd_config.d/10-hardening.conf <<'EOF'
# Managed by deploy/harden-server.sh
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin prohibit-password
PubkeyAuthentication yes
MaxAuthTries 4
LoginGraceTime 30
X11Forwarding no
EOF
  sshd -t && systemctl reload ssh 2>/dev/null || systemctl reload sshd
  echo "→ sshd: key-only"
fi

# --- Firewall -------------------------------------------------------------
# SSH is allowed BEFORE ufw is enabled, so the current session survives.
ufw allow 22/tcp comment ssh >/dev/null
if [ "$ROLE" = app ]; then
  ufw allow 80/tcp  comment http  >/dev/null
  ufw allow 443/tcp comment https >/dev/null
  ufw allow 443/udp comment http3 >/dev/null
else
  ufw allow from "$APP_IP" to any port 5432 proto tcp comment postgres-from-app >/dev/null
fi
ufw default deny incoming >/dev/null
ufw default allow outgoing >/dev/null
ufw --force enable >/dev/null
echo "→ ufw: enabled ($ROLE)"

# --- fail2ban -------------------------------------------------------------
cat > /etc/fail2ban/jail.d/10-hardening.local <<'EOF'
# Managed by deploy/harden-server.sh
[DEFAULT]
backend = systemd
bantime = 1h
findtime = 10m
maxretry = 5

[sshd]
enabled = true

# Repeat offenders: banned 3+ times in a day -> one week.
[recidive]
enabled = true
backend = auto
logpath = /var/log/fail2ban.log
bantime = 1w
findtime = 1d
maxretry = 3
EOF
systemctl enable --now fail2ban >/dev/null 2>&1
fail2ban-client reload >/dev/null
echo "→ fail2ban: sshd + recidive"

# --- Automatic security updates -------------------------------------------
cat > /etc/apt/apt.conf.d/20auto-upgrades <<'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
EOF
systemctl enable --now unattended-upgrades >/dev/null 2>&1
echo "→ unattended-upgrades: on (security updates; no automatic reboot)"

status
