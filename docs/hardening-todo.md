# Hardening follow-ups

Cheap header and limit changes landed with the token budget. These stayed out because they are larger or can break a running install.

| Severity | Item | One-line fix |
| --- | --- | --- |
| High | Server-side fetches (web tools, link previews, MCP) need a full private-network review beyond the existing URL allow checks. | Block private, link-local, and 169.254.169.254 ranges on every outbound fetch and re-check DNS. |
| High | Disposable-email and per-IP signup limits are not in front of Better Auth. | Add an IP bucket and a disposable-domain list when `SIGNUPS_ENABLED` is on. |
| Medium | Request body limits for base64 artifacts are the existing attachment cap, not a separate global body limit. | Set an explicit proxy and API body limit at the 10 MB upload ceiling. |
| Medium | Web app security headers were not changed in this pass. | Add HSTS, nosniff, frame-ancestors and a referrer policy on the web container. |
| Medium | `pnpm audit` was not clean in every transitive dependency. | Upgrade the high and critical advisories in a dedicated dependency PR. |
| Low | `./scripts/backup.sh` already dumps Postgres and is not scheduled. | Add a host cron for that script. Do not enable it from Compose. |
| Low | Keenable and other tool output is still untrusted data inside the model prompt. | Keep treating it as data and do not add a new execution path for it. |
