# Spark product fork — Rakazo

This document describes **our** changes on top of [elie222/rakazo](https://github.com/elie222/rakazo). Upstream `main` is not replaced; product work lives on `spark/*` branches and **`spark/main`** (integration).

## Deployed stack (backend-1, reference)

| Service | Image tag | Source branch / PR |
|---------|-----------|-------------------|
| **api** | `spark-onecomputer-9f14bfb` | [PR #3](https://github.com/aaloaoaooaolaoloalao/rakazo/pull/3) `spark/one-computer-per-user` |
| **worker** | `spark-onecomputer-9f14bfb` | same as api |
| **web** | `spark-web-9b5a331` | `spark/hide-model-voice-settings` (not merged into api image) |

Public HTTPS host: `https://34-165-87-142.sslip.io` (sslip.io; replace with a real domain later).

## Branches & PRs (one line each)

| Branch / PR | Summary |
|-------------|---------|
| **PR #1** `spark/mistral-default-for-all-users` | Deployment-wide Mistral default (`DEFAULT_MODEL_*`). |
| **PR #2** `spark/auto-provision-new-user` | Auto-provision personal space, default bot, computer record for new users. |
| **PR #3** `spark/one-computer-per-user` | One shared team computer per user; normalize dedicated → team for new routes; `SANDBOX_MAX_COMPUTERS_PER_USER`. |
| `spark/hide-model-voice-settings` | Web UI: hide model/voice settings behind product flags (`product-ui.ts`). |
| `spark/e2b-computer-1vcpu-2gb` | Cheaper E2B computer template (build tooling; not required for current docker deploy). |
| **`spark/main`** | Integration branch = PR #3 + web flags from hide-model (matches **intended** full product source; images on server were built per-service as above). |

`product/apple-signin-auto-computer` — **not present** on the fork at last check.

## Environment variables (product)

Set in `docker-compose.override.yml` on the server (not all are in `docker-compose.images.yml`):

| Variable | Purpose |
|----------|---------|
| `DEFAULT_MODEL_PROVIDER` | e.g. `mistral` |
| `DEFAULT_MODEL_ID` | e.g. `mistral-medium-latest` |
| `AUTO_PROVISION_NEW_USERS` | `true` — provision on signup |
| `AUTO_PROVISION_DEFAULT_BOT_NAME` | Default bot display name (Hebrew) |
| `AUTO_PROVISION_MAX_COMPUTERS_PER_USER` | Cap for auto-provision (min with sandbox cap) |
| `SANDBOX_MAX_COMPUTERS_PER_USER` | Hard cap on new computer rows per user |

## Rollback scripts (on server)

Paths under `~/rakazo/` on backend-1:

| Script | Effect |
|--------|--------|
| `rollback-onecomputer.sh` | api → `spark-autoprov-1c97a84`, worker → `spark-mistral-a0cbd90`, keeps web `spark-web-9b5a331` |
| `rollback-api-autoprov.sh` | api/worker → `spark-mistral-a0cbd90`, disables auto-provision in `.env` |
| `rollback-web-upstream.sh` | web → upstream-style tag |
| `rollback-api-worker-upstream.sh` | api + worker rollback helper |

Copies without secrets live in this repo under `deploy/`.

## Open items

- **GHCR push** needs `write:packages` (or CI) to publish images; production uses **local `docker build`** + `pull_policy: never`.
- Map **`DEFAULT_MODEL_*`** in `docker-compose.images.yml` for cleaner defaults.
- **Sign in with Apple**, **push notifications**, **production domain** (replace sslip.io).
- iOS client: separate repo [sparkai-ios](https://github.com/aaloaoaooaolaoloalao/sparkai-ios).

## vs upstream

We do **not** delete user data or existing computer rows. Legacy dedicated computers keep working. New users get one team computer shared across spaces.
