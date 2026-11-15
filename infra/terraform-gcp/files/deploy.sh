#!/bin/bash
# Deploys one image to this server and rolls back automatically if it is unhealthy.
# Called by Jenkins through an IAP SSH tunnel:  sudo /opt/erp/deploy.sh <image-uri>
set -euo pipefail

NEW_IMAGE="${1:?usage: deploy.sh <image-uri>}"
cd /opt/erp

GAR_REGION=$(grep '^GAR_REGION=' .env | cut -d= -f2)
REGISTRY="${GAR_REGION}-docker.pkg.dev"
PREV_IMAGE=$(grep '^APP_IMAGE=' .env | cut -d= -f2- || true)

set_image() {
  sed -i '/^APP_IMAGE=/d' .env
  echo "APP_IMAGE=$1" >> .env
}

healthy() {
  for _ in $(seq 1 30); do
    if curl -fsS --max-time 3 http://127.0.0.1/health >/dev/null 2>&1; then return 0; fi
    sleep 5
  done
  return 1
}

echo "Deploying $NEW_IMAGE (previous: ${PREV_IMAGE:-none})"

# Authenticate Docker to Artifact Registry using the app VM's service account
gcloud auth configure-docker "${REGISTRY}" --quiet

set_image "$NEW_IMAGE"
docker compose pull app
docker compose up -d --remove-orphans

if healthy; then
  echo "DEPLOY OK: $NEW_IMAGE is healthy"
  curl -fsS http://127.0.0.1/health; echo
  docker image prune -af --filter "until=168h" >/dev/null || true
  exit 0
fi

echo "DEPLOY FAILED: $NEW_IMAGE did not become healthy. Last app logs:"
docker compose logs --tail 50 app || true

if [ -n "$PREV_IMAGE" ]; then
  echo "ROLLING BACK to $PREV_IMAGE"
  set_image "$PREV_IMAGE"
  docker compose up -d
  healthy && echo "Rollback OK" || echo "Rollback ALSO unhealthy — manual action needed"
fi
exit 1
