#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
API_TAG=ghcr.io/aaloaoaooaolaoloalao/rakazo/app:spark-autoprov-1c97a84
WORKER_TAG=ghcr.io/aaloaoaooaolaoloalao/rakazo/app:spark-mistral-a0cbd90
cat > docker-compose.override.yml <<EOF
# Spark product web UI (fork spark/hide-model-voice-settings). Only web uses this tag.
# api: spark/auto-provision-new-user (1c97a84). worker: spark-mistral-a0cbd90.
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
      AUTO_PROVISION_NEW_USERS: "true"
      AUTO_PROVISION_DEFAULT_BOT_NAME: "העוזר שלי"
      AUTO_PROVISION_MAX_COMPUTERS_PER_USER: "1"
  worker:
    image: ${WORKER_TAG}
    pull_policy: never
    environment:
      DEFAULT_MODEL_PROVIDER: mistral
      DEFAULT_MODEL_ID: mistral-medium-latest
EOF
sudo docker compose --env-file .env -f docker-compose.images.yml -f docker-compose.override.yml up -d --pull never api worker
echo "Rollback complete: api ${API_TAG}, worker ${WORKER_TAG}"
