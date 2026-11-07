#!/bin/bash
# Dijalankan SEKALI di VM Debian 12: sudo bash setup.sh
# Memasang Docker, swap 2 GB, dan "deployer" yang menarik image baru saat metadata image-tag berubah.
set -euo pipefail

echo "== Paket =="
apt-get update -y
DEBIAN_FRONTEND=noninteractive apt-get install -y docker.io curl python3 ca-certificates
systemctl enable --now docker
mkdir -p /etc/docker
cat > /etc/docker/daemon.json <<'EOF'
{ "log-driver": "json-file", "log-opts": { "max-size": "10m", "max-file": "3" } }
EOF
systemctl restart docker

echo "== Swap 2 GB (VM e2-micro hanya 1 GB RAM) =="
if [ ! -f /swapfile ]; then
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi
swapon -a || true

echo "== Skrip deployer =="
mkdir -p /var/lib/tokoku
cat > /usr/local/bin/tokoku-deploy <<'DEPLOY'
#!/bin/bash
set -euo pipefail
MD=http://metadata.google.internal/computeMetadata/v1
H="Metadata-Flavor: Google"
STATE=/var/lib/tokoku
REGION=us-central1

TAG=$(curl -sf -H "$H" "$MD/instance/attributes/image-tag" || true)
if [ -z "$TAG" ]; then exit 0; fi
CURRENT=$(cat $STATE/current-tag 2>/dev/null || true)
FAILED=$(cat $STATE/failed-tag 2>/dev/null || true)
if [ "$TAG" = "$CURRENT" ] || [ "$TAG" = "$FAILED" ]; then exit 0; fi

echo "Deploy tag: $TAG (sebelumnya: ${CURRENT:-none})"
PROJECT=$(curl -sf -H "$H" "$MD/project/project-id")
TOKEN=$(curl -sf -H "$H" "$MD/instance/service-accounts/default/token" \
  | python3 -c 'import sys,json;print(json.load(sys.stdin)["access_token"])')
echo "$TOKEN" | docker login -u oauth2accesstoken --password-stdin "$REGION-docker.pkg.dev" >/dev/null
DB=$(curl -sf -H "Authorization: Bearer $TOKEN" \
  "https://secretmanager.googleapis.com/v1/projects/$PROJECT/secrets/database-url/versions/latest:access" \
  | python3 -c 'import sys,json,base64;print(base64.b64decode(json.load(sys.stdin)["payload"]["data"]).decode(),end="")')

image() { echo "$REGION-docker.pkg.dev/$PROJECT/tokoku/app:$1"; }
start() {
  docker rm -f tokoku >/dev/null 2>&1 || true
  docker run -d --name tokoku --restart unless-stopped -p 80:8080 \
    --memory=600m -e DATABASE_URL="$DB" "$(image "$1")" >/dev/null
}
healthy() {
  for _ in $(seq 1 20); do
    if curl -sf -o /dev/null http://localhost/; then return 0; fi
    sleep 3
  done
  return 1
}

docker pull "$(image "$TAG")"
start "$TAG"
if healthy; then
  echo "$TAG" > $STATE/current-tag
  rm -f $STATE/failed-tag
  echo "Deploy $TAG berhasil"
  docker image prune -af --filter "until=24h" >/dev/null || true
else
  echo "Deploy $TAG GAGAL health check, kembali ke ${CURRENT:-none}"
  echo "$TAG" > $STATE/failed-tag
  if [ -n "$CURRENT" ]; then start "$CURRENT"; else docker rm -f tokoku >/dev/null 2>&1 || true; fi
  exit 1
fi
DEPLOY
chmod +x /usr/local/bin/tokoku-deploy

cat > /etc/systemd/system/tokoku-deploy.service <<'EOF'
[Unit]
Description=Tokoku deployer
After=docker.service network-online.target
Wants=network-online.target
[Service]
Type=oneshot
ExecStart=/usr/local/bin/tokoku-deploy
EOF
cat > /etc/systemd/system/tokoku-deploy.timer <<'EOF'
[Unit]
Description=Cek image-tag baru tiap 30 detik
[Timer]
OnBootSec=20s
OnUnitInactiveSec=30s
[Install]
WantedBy=timers.target
EOF
systemctl daemon-reload
systemctl enable --now tokoku-deploy.timer

echo "Selesai. VM akan men-deploy otomatis setelah metadata image-tag diisi oleh Cloud Build."
echo "Lihat log: sudo journalctl -u tokoku-deploy -n 50 --no-pager"
