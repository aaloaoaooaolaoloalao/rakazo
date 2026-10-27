#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
cat > docker-compose.override.yml <<'EOF'
# Spark product web UI (fork spark/hide-model-voice-settings). Only web uses this tag.
services:
  web:
    image: ghcr.io/aaloaoaooaolaoloalao/rakazo/app:spark-web-9b5a331
    pull_policy: never
EOF
sed -i '/^DEFAULT_MODEL_PROVIDER=/d' .env
sed -i '/^DEFAULT_MODEL_ID=/d' .env
chmod 600 .env
sudo docker compose --env-file .env -f docker-compose.images.yml -f docker-compose.override.yml up -d --pull never api worker
echo "Rollback complete: api/worker on upstream compose image (RAKAZO_IMAGE_TAG from .env); web override preserved."
