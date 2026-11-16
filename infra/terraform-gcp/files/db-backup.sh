#!/bin/bash
# Dumps the production database and uploads it to Cloud Storage.
# Run by the erp-db-backup systemd timer (daily); also safe to run by hand.
#
# Old backups are removed by the bucket's lifecycle rule, not by this script,
# so a broken run can never delete history.
set -euo pipefail

cd /opt/erp

# `|| true`: with pipefail a missing line would otherwise abort before the
# friendly message below.
BUCKET=$(grep '^BACKUP_BUCKET=' .env | cut -d= -f2- || true)
if [ -z "$BUCKET" ]; then
  echo "BACKUP_BUCKET is not set in /opt/erp/.env — nothing to do."
  exit 0
fi

STAMP=$(date -u +%Y-%m-%dT%H-%M-%SZ)
ARCHIVE="/tmp/erp-${STAMP}.sql.gz"
trap 'rm -f "$ARCHIVE"' EXIT

echo "[backup] dumping database at ${STAMP}"

# --clean --if-exists so the dump can be restored over an existing database.
docker compose exec -T db \
  pg_dump --username=erp --dbname=erp --clean --if-exists --no-owner \
  | gzip -9 > "$ARCHIVE"

SIZE=$(stat -c %s "$ARCHIVE")
# A valid gzipped dump of an empty schema is still well over 1 KB; anything
# smaller means pg_dump failed and wrote nothing useful.
if [ "$SIZE" -lt 1024 ]; then
  echo "[backup] FAILED: dump is only ${SIZE} bytes, refusing to upload."
  exit 1
fi

gzip -t "$ARCHIVE"
echo "[backup] dump OK (${SIZE} bytes), uploading"

gcloud storage cp "$ARCHIVE" "gs://${BUCKET}/daily/erp-${STAMP}.sql.gz" --quiet

echo "[backup] uploaded gs://${BUCKET}/daily/erp-${STAMP}.sql.gz"
