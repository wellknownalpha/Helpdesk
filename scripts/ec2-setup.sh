#!/bin/bash
# NexusDesk EC2 bootstrap (Amazon Linux 2023 / Ubuntu 22.04+).
# Run as root (or with sudo) on a fresh EC2 instance, then deploy the app.
set -e

if [ "$(id -u)" -ne 0 ]; then echo "Please run as root: sudo bash scripts/ec2-setup.sh"; exit 1; fi

echo "[1/4] Installing Docker..."
if command -v dnf >/dev/null 2>&1; then
  dnf update -y
  dnf install -y docker
  systemctl enable --now docker
else
  apt-get update -y
  apt-get install -y docker.io docker-compose-plugin
  systemctl enable --now docker
fi
docker --version
docker compose version

echo "[2/4] Opening firewall note: ensure your EC2 Security Group allows TCP 3002 (app) from your office/VPN."
echo "      (Restrict 5433/8025/1025 to the instance itself — no SG rule needed for those.)"

echo "[3/4] Deploy steps (run as ec2-user / ubuntu):"
cat <<'EOF'
  # a) Copy this project to the server (from your machine):
  #    scp -r /path/to/nexusdesk ec2-user@<EC2-IP>:/home/ec2-user/nexusdesk
  #    — or — git clone <your-repo-url> nexusdesk && cd nexusdesk
  # b) Configure secrets (REQUIRED):
  cp .env.example .env
  openssl rand -base64 32   # paste output as AUTH_SECRET in .env
  #    Edit .env: set AUTH_SECRET and APP_URL=http://<EC2-IP-or-domain>:3002
  # c) Launch everything (builds app, starts DB, migrates, seeds if empty):
  docker compose up -d --build
  # d) Open http://<EC2-IP-or-domain>:3002 and sign in:
  #    admin@nexusdesk.local / Password123!  (change passwords immediately)
EOF

echo "[4/4] Done. After code changes, redeploy with: docker compose up -d --build"
