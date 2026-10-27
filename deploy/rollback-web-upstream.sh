#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
rm -f docker-compose.override.yml
sudo docker compose --env-file .env -f docker-compose.images.yml up -d --pull never web
echo "web rolled back to upstream tag from .env (RAKAZO_IMAGE / RAKAZO_IMAGE_TAG)"
