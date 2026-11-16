#!/bin/bash
# Restores the database from a backup in Cloud Storage.
#
#   sudo /opt/erp/db-restore.sh                 # list available backups
#   sudo /opt/erp/db-restore.sh <object-name>   # restore that backup
#
# This REPLACES the current database contents. It asks for confirmation unless
# CONFIRM=yes is set in the environment.
set -euo pipefail

cd /opt/erp

BUCKET=$(grep '^BACKUP_BUCKET=' .env | cut -d= -f2- || true)
if [ -z "$BUCKET" ]; then
  echo "BACKUP_BUCKET is not set in /opt/erp/.env."
  exit 1
fi

OBJECT="${1:-}"

if [ -z "$OBJECT" ]; then
  echo "Available backups in gs://${BUCKET}/daily/ (newest last):"
  gcloud storage ls "gs://${BUCKET}/daily/" | sort
  echo
  echo "Restore one with:  sudo $0 daily/erp-<timestamp>.sql.gz"
  exit 0
fi

if [ "${CONFIRM:-}" != "yes" ]; then
  echo "About to REPLACE the contents of the production database with:"
  echo "  gs://${BUCKET}/${OBJECT}"
  read -r -p "Type 'yes' to continue: " answer
  [ "$answer" = "yes" ] || { echo "Aborted."; exit 1; }
fi

ARCHIVE="/tmp/restore-$$.sql.gz"
trap 'rm -f "$ARCHIVE"' EXIT

echo "[restore] downloading gs://${BUCKET}/${OBJECT}"
gcloud storage cp "gs://${BUCKET}/${OBJECT}" "$ARCHIVE" --quiet
gzip -t "$ARCHIVE"

# Stop the app so nothing writes while the schema is being replaced.
echo "[restore] stopping app"
docker compose stop app

echo "[restore] loading dump"
gunzip -c "$ARCHIVE" | docker compose exec -T db psql --username=erp --dbname=erp --quiet

echo "[restore] starting app"
docker compose start app

echo "[restore] done. Verify with: curl -fsS http://127.0.0.1:3000/health"
