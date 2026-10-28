# APNs findings

Push registration is not `user_devices`. That table is the paired-computer device list. Notification tokens live in `push_tokens`: one encrypted token per user, tied to the current session (`packages/db/prisma/schema.prisma`, `packages/adapters/src/push-token-store.ts`).

The RPC is `notifications/registerPush` with `{ token }` and `notifications/unregisterPush`. `apps/api` sends through `ExpoPushProvider` to `https://exp.host/--/api/v2/push/send`. A finished run, a help or approval ask, and routine results already call `NotificationProvider.send` with `kind` `completion`, `help`, or `takeover`. The run is not failed when push throws.

The iOS app already asks for a device token in `PushRegistrar` and posts it as an opaque string. `aps-environment` is `development`, and `remote-notification` is already a background mode. Permission today is requested from notification settings, and again on launch only if it was already granted.

APNs is added beside Expo. A row with provider `apns` is sent to Apple. Existing Expo rows stay on Expo. If `APNS_KEY_ID` and a key are unset, APNs sends are skipped and the agent run continues.

## Env

`APNS_KEY_P8` or `APNS_KEY_PATH`, `APNS_KEY_ID`, `APNS_TEAM_ID` (default team `WNAP7G2A58`), `APNS_TOPIC` (default `com.alonshelly.sparkai`), `APNS_ENV` (`production` or `sandbox`).

Do not commit the `.p8` file. Put the path or the key only in the server environment.

## Manual

- In Xcode, keep the Push Notifications capability. A TestFlight build needs `aps-environment` production; the checked-in entitlement is `development` for local builds.
- Create the key in the Apple developer account, note the Key ID, and set it on the server. The app does not contain the key.
- A real device is required to confirm delivery, the tap, and the badge. Unit tests cover the JWT, the payload, and error classification only.
