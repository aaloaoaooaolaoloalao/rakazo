#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
API_TAG=ghcr.io/aaloaoaooaolaoloalao/rakazo/app:spark-mistral-a0cbd90
WORKER_TAG=ghcr.io/aaloaoaooaolaoloalao/rakazo/app:spark-mistral-a0cbd90
cat > docker-compose.override.yml <<EOF
# Spark product web UI (fork spark/hide-model-voice-settings). Only web uses this tag.
# api/worker: spark/mistral-default-for-all-users local build (a0cbd90).
services:
  web:
    image: ghcr.io/aaloaoaooaolaoloalao/rakazo/app:spark-web-9b5a331
    pull_policy: never
  api:
    image: ${API_TAG}
    pull_policy: never
    environment:
      DEFAULT_MODEL_PROVIDER: mistral
      DEFAULT_MODEL_ID: mistral-medium-latest
  worker:
    image: ${WORKER_TAG}
    pull_policy: never
    environment:
      DEFAULT_MODEL_PROVIDER: mistral
      DEFAULT_MODEL_ID: mistral-medium-latest
EOF
if grep -q '^AUTO_PROVISION_NEW_USERS=' .env; then
  sed -i 's/^AUTO_PROVISION_NEW_USERS=.*/AUTO_PROVISION_NEW_USERS=false/' .env
else
  echo 'AUTO_PROVISION_NEW_USERS=false' >> .env
fi
chmod 600 .env
sudo docker compose --env-file .env -f docker-compose.images.yml -f docker-compose.override.yml up -d --pull never api
echo "Rollback complete: api on spark-mistral-a0cbd90, AUTO_PROVISION_NEW_USERS=false"
