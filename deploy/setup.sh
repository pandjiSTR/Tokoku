#!/bin/bash
# Dijalankan di VM Debian 12:  sudo bash setup.sh [--https]
# Aman dijalankan ulang (idempoten). Memasang: Docker, swap, deployer otomatis, timer kedaluwarsa pesanan,
# timer backup database, dan (opsional --https) Caddy untuk HTTPS gratis lewat domain IP-ANDA.sslip.io.
set -euo pipefail

HTTPS=false
for a in "$@"; do [ "$a" = "--https" ] && HTTPS=true; done
STATE=/var/lib/tokoku
mkdir -p "$STATE"

echo "== Paket =="
apt-get update -y
PKGS="docker.io curl python3 ca-certificates"
$HTTPS && PKGS="$PKGS caddy"
DEBIAN_FRONTEND=noninteractive apt-get install -y $PKGS
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

echo "== Pustaka bersama =="
cat > /usr/local/bin/tokoku-lib <<'LIB'
MD=http://metadata.google.internal/computeMetadata/v1
H="Metadata-Flavor: Google"
md() { curl -sf -H "$H" "$MD/$1" || true; }
get_token() {
  curl -sf -H "$H" "$MD/instance/service-accounts/default/token" \
    | python3 -c 'import sys,json;print(json.load(sys.stdin)["access_token"])'
}
# secret NAMA: membaca versi terbaru dari Secret Manager (butuh TOKEN dan PROJECT). Kosong jika tidak ada.
secret() {
  curl -sf -H "Authorization: Bearer $TOKEN" \
    "https://secretmanager.googleapis.com/v1/projects/$PROJECT/secrets/$1/versions/latest:access" \
    | python3 -c 'import sys,json,base64;print(base64.b64decode(json.load(sys.stdin)["payload"]["data"]).decode(),end="")' || true
}
LIB

echo "== Deployer =="
cat > /usr/local/bin/tokoku-deploy <<'DEPLOY'
#!/bin/bash
set -euo pipefail
source /usr/local/bin/tokoku-lib
STATE=/var/lib/tokoku
REGION=us-central1

TAG=$(md instance/attributes/image-tag)
if [ -z "$TAG" ]; then exit 0; fi
CURRENT=$(cat $STATE/current-tag 2>/dev/null || true)
FAILED=$(cat $STATE/failed-tag 2>/dev/null || true)
HOST=$(cat $STATE/host 2>/dev/null || true)
DEPLOYED_HOST=$(cat $STATE/deployed-host 2>/dev/null || true)
HTTPS=false; [ -f $STATE/https ] && HTTPS=true

if [ "$TAG" = "$FAILED" ]; then exit 0; fi
# Tag sama: lewati, kecuali mode HTTPS dan alamat domain berubah (IP VM berganti setelah dinyalakan ulang)
if [ "$TAG" = "$CURRENT" ] && { ! $HTTPS || [ "$HOST" = "$DEPLOYED_HOST" ]; }; then exit 0; fi

echo "Deploy tag: $TAG (sebelumnya: ${CURRENT:-none})"
PROJECT=$(md project/project-id)
TOKEN=$(get_token)
echo "$TOKEN" | docker login -u oauth2accesstoken --password-stdin "$REGION-docker.pkg.dev" >/dev/null
DB=$(secret database-url)
APP_ENV=$(secret app-env)
if [ -z "$DB" ]; then echo "Secret database-url tidak terbaca"; exit 1; fi

image() { echo "$REGION-docker.pkg.dev/$PROJECT/tokoku/app:$1"; }
start() {
  docker rm -f tokoku >/dev/null 2>&1 || true
  ENVF=$(mktemp); chmod 600 "$ENVF"
  printf '%s\n' "$APP_ENV" > "$ENVF"
  PORTS="-p 80:8080 -p 127.0.0.1:8080:8080"
  EXTRA=""
  if $HTTPS; then
    PORTS="-p 127.0.0.1:8080:8080"
    [ -n "$HOST" ] && EXTRA="-e APP_URL=https://$HOST -e TRUST_PROXY=true"
  fi
  # shellcheck disable=SC2086
  docker run -d --name tokoku --restart unless-stopped $PORTS \
    --memory=600m --env-file "$ENVF" $EXTRA -e DATABASE_URL="$DB" "$(image "$1")" >/dev/null
  rm -f "$ENVF"
}
healthy() {
  for _ in $(seq 1 20); do
    if curl -sf -o /dev/null http://127.0.0.1:8080/; then return 0; fi
    sleep 3
  done
  return 1
}

docker pull "$(image "$TAG")"
start "$TAG"
if healthy; then
  echo "$TAG" > $STATE/current-tag
  echo "$HOST" > $STATE/deployed-host
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

echo "== Kedaluwarsa pesanan berkala =="
cat > /usr/local/bin/tokoku-cron <<'CRON'
#!/bin/bash
# Memanggil endpoint internal tiap 5 menit. CRON_SECRET dibaca dari kontainer yang sedang berjalan
# (bukan dari Secret Manager), jadi tidak memakai kuota panggilan API.
set -euo pipefail
SECRET=$(docker exec tokoku printenv CRON_SECRET 2>/dev/null || true)
if [ -z "$SECRET" ]; then echo "CRON_SECRET belum ada di secret app-env atau kontainer belum jalan, dilewati"; exit 0; fi
curl -sf -m 20 -X POST -H "x-cron-secret: $SECRET" http://127.0.0.1:8080/api/cron/expire
echo
CRON

echo "== Backup database =="
cat > /usr/local/bin/tokoku-backup <<'BACKUP'
#!/bin/bash
# pg_dump ke Cloud Storage. Butuh: metadata "backup-bucket" dan secret "backup-database-url" (string Session pooler, port 5432).
set -euo pipefail
source /usr/local/bin/tokoku-lib
PROJECT=$(md project/project-id)
BUCKET=$(md instance/attributes/backup-bucket)
if [ -z "$BUCKET" ]; then echo "Metadata backup-bucket belum diatur, backup dilewati"; exit 0; fi
TOKEN=$(get_token)
URL=$(secret backup-database-url)
if [ -z "$URL" ]; then echo "Secret backup-database-url belum ada"; exit 1; fi

FILE=/var/lib/tokoku/backup-$(date -u +%Y%m%d-%H%M%S).dump
trap 'rm -f "$FILE"' EXIT
docker run --rm -e PGURL="$URL" postgres:17-alpine sh -c 'pg_dump --no-owner --no-privileges -Fc "$PGURL"' > "$FILE"
if [ ! -s "$FILE" ]; then echo "Hasil dump kosong"; exit 1; fi
curl -sf -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/octet-stream" \
  --data-binary @"$FILE" \
  "https://storage.googleapis.com/upload/storage/v1/b/$BUCKET/o?uploadType=media&name=$(basename "$FILE")" >/dev/null
echo "Backup tersimpan: gs://$BUCKET/$(basename "$FILE") ($(stat -c %s "$FILE") byte)"
BACKUP

chmod +x /usr/local/bin/tokoku-deploy /usr/local/bin/tokoku-cron /usr/local/bin/tokoku-backup

echo "== HTTPS (Caddy) =="
if $HTTPS; then
  touch "$STATE/https"
  cat > /usr/local/bin/tokoku-caddy <<'CADDY'
#!/bin/bash
# Menulis Caddyfile dari IP publik VM saat ini (domain gratis IP-ANDA.sslip.io) lalu memuat ulang Caddy.
set -euo pipefail
source /usr/local/bin/tokoku-lib
IP=$(md instance/network-interfaces/0/access-configs/0/external-ip)
if [ -z "$IP" ]; then echo "IP publik tidak ditemukan"; exit 1; fi
HOST="${IP//./-}.sslip.io"
echo "$HOST" > /var/lib/tokoku/host
cat > /etc/caddy/Caddyfile <<EOF
$HOST {
	encode gzip
	reverse_proxy 127.0.0.1:8080
	header {
		Strict-Transport-Security "max-age=31536000"
		-Server
	}
}
EOF
systemctl restart caddy
echo "Alamat: https://$HOST"
CADDY
  chmod +x /usr/local/bin/tokoku-caddy
  cat > /etc/systemd/system/tokoku-caddy.service <<'EOF'
[Unit]
Description=Tokoku: atur domain HTTPS dari IP publik
After=network-online.target
Wants=network-online.target
[Service]
Type=oneshot
RemainAfterExit=yes
ExecStart=/usr/local/bin/tokoku-caddy
[Install]
WantedBy=multi-user.target
EOF
  systemctl daemon-reload
  systemctl enable tokoku-caddy.service
  systemctl restart tokoku-caddy.service
else
  rm -f "$STATE/https"
fi

echo "== Timer =="
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
cat > /etc/systemd/system/tokoku-cron.service <<'EOF'
[Unit]
Description=Tokoku: kedaluwarsa pesanan belum dibayar
After=docker.service network-online.target
[Service]
Type=oneshot
ExecStart=/usr/local/bin/tokoku-cron
EOF
cat > /etc/systemd/system/tokoku-cron.timer <<'EOF'
[Unit]
Description=Jalankan kedaluwarsa pesanan tiap 5 menit
[Timer]
OnBootSec=2min
OnUnitInactiveSec=5min
[Install]
WantedBy=timers.target
EOF
cat > /etc/systemd/system/tokoku-backup.service <<'EOF'
[Unit]
Description=Tokoku: backup database ke Cloud Storage
After=docker.service network-online.target
[Service]
Type=oneshot
ExecStart=/usr/local/bin/tokoku-backup
EOF
cat > /etc/systemd/system/tokoku-backup.timer <<'EOF'
[Unit]
Description=Backup database mingguan
[Timer]
OnCalendar=Sun *-*-* 20:00:00
Persistent=true
[Install]
WantedBy=timers.target
EOF
systemctl daemon-reload
systemctl enable --now tokoku-deploy.timer tokoku-cron.timer tokoku-backup.timer

echo
echo "Selesai. Mode: $($HTTPS && echo HTTPS || echo HTTP)."
echo "Log deploy : sudo journalctl -u tokoku-deploy -n 50 --no-pager"
echo "Log cron   : sudo journalctl -u tokoku-cron -n 20 --no-pager"
echo "Log backup : sudo journalctl -u tokoku-backup -n 20 --no-pager"
$HTTPS && echo "Alamat HTTPS: https://$(cat $STATE/host 2>/dev/null)"
true
