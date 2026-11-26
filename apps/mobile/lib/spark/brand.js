/**
 * SparkAI mobile brand overlay.
 *
 * Applied only when `SPARK` or `EXPO_PUBLIC_SPARK` is `1` / `true`. Otherwise
 * `applySparkBrand` returns the same config object so upstream Rakazo builds
 * stay byte-for-byte on this path.
 *
 * This overlay is CommonJS on purpose. Expo compiles only `app.config.ts`; a
 * nested TypeScript import is not loaded. `brand.d.ts` types the same exports.
 *
 * Defaults (each overridable by the matching env var):
 * - name: SparkAI (`SPARK_APP_NAME`)
 * - version: at least 1.0.21 (`SPARK_APP_VERSION`)
 * - iOS bundle id: com.alonshelly.sparkai (`SPARK_IOS_BUNDLE_ID`)
 * - notification extension: com.alonshelly.sparkai.notification (`SPARK_NOTIFICATION_BUNDLE_ID`)
 * - other iOS extensions: the same bundle prefix plus their existing suffix
 * - app group: group.com.alonshelly.sparkai (`SPARK_APP_GROUP`)
 * - Apple team: WNAP7G2A58 (`SPARK_APPLE_TEAM_ID`)
 * - Android package: com.alonshelly.sparkai (`SPARK_ANDROID_PACKAGE`)
 * - iOS buildNumber and Android versionCode: at least 10
 *   (`SPARK_IOS_BUILD_NUMBER`, `SPARK_ANDROID_VERSION_CODE`; lower values are raised to 10)
 * - EAS project id / owner: `SPARK_EAS_PROJECT_ID` and `SPARK_EXPO_OWNER`.
 *   When unset, a placeholder is written and upstream's Expo project is detached.
 *   Do not reuse Rakazo's project id.
 * - URL scheme stays `rakazo`.
 *
 * `RAKAZO_IOS_BUNDLE_ID`, `RAKAZO_APPLE_TEAM_ID`, `RAKAZO_EXPO_PROJECT_ID`, and
 * `RAKAZO_EXPO_OWNER` still apply after this overlay, so a self-signed override wins.
 *
 * App icon and splash use the Spark mark shipped with the web app
 * (`apps/web/public/icon-512.png`). Replace it with a 1024px store icon before
 * App Store submission if EAS warns about the size.
 */

const MIN_VERSION = "1.0.21";
const MIN_BUILD = 10;
const DEFAULT_BUNDLE_ID = "com.alonshelly.sparkai";
const DEFAULT_TEAM_ID = "WNAP7G2A58";
const SPARK_ICON = "../../apps/web/public/icon-512.png";
const SPARK_SPLASH_BACKGROUND = "#ECEAE2";
/** Not a real Expo project. Set `SPARK_EAS_PROJECT_ID` before an EAS build. */
const SPARK_EAS_PROJECT_PLACEHOLDER = "spark-eas-project-id";
/** Not a real Expo account. Set `SPARK_EXPO_OWNER` before an EAS build. */
const SPARK_EXPO_OWNER_PLACEHOLDER = "spark-eas-owner";
const UPSTREAM_EXPO_PROJECT_ID = "07f7eb04-45e3-47fe-9374-99a2f991131e";

const PERMISSION_KEYS = new Set([
  "microphonePermission",
  "speechRecognitionPermission",
  "photosPermission",
  "cameraPermission",
  "savePhotosPermission",
  "calendarPermission",
  "remindersPermission",
]);

function sparkEnvEnabled(env = process.env) {
  return truthy(env.SPARK) || truthy(env.EXPO_PUBLIC_SPARK);
}

function applySparkBrand(config, env = process.env) {
  if (!sparkEnvEnabled(env)) return config;

  const name = readEnv(env, "SPARK_APP_NAME") ?? "SparkAI";
  const bundleId = readEnv(env, "SPARK_IOS_BUNDLE_ID") ?? DEFAULT_BUNDLE_ID;
  const androidPackage = readEnv(env, "SPARK_ANDROID_PACKAGE") ?? DEFAULT_BUNDLE_ID;
  const teamId = readEnv(env, "SPARK_APPLE_TEAM_ID") ?? DEFAULT_TEAM_ID;
  const appGroup = readEnv(env, "SPARK_APP_GROUP") ?? `group.${bundleId}`;
  const notificationBundleId =
    readEnv(env, "SPARK_NOTIFICATION_BUNDLE_ID") ?? `${bundleId}.notification`;
  const version = atLeastVersion(readEnv(env, "SPARK_APP_VERSION") ?? config.version, MIN_VERSION);
  const buildNumber = String(
    atLeastInt(readEnv(env, "SPARK_IOS_BUILD_NUMBER") ?? config.ios?.buildNumber, MIN_BUILD),
  );
  const versionCode = atLeastInt(
    readEnv(env, "SPARK_ANDROID_VERSION_CODE") ?? config.android?.versionCode,
    MIN_BUILD,
  );
  const projectId = readEnv(env, "SPARK_EAS_PROJECT_ID") ?? SPARK_EAS_PROJECT_PLACEHOLDER;
  const owner = readEnv(env, "SPARK_EXPO_OWNER") ?? SPARK_EXPO_OWNER_PLACEHOLDER;
  const previousBundleId = config.ios?.bundleIdentifier;

  const { icon: _upstreamIcon, ...iosRest } = config.ios ?? {};
  const infoPlist = renamePlist(iosRest.infoPlist, name);

  let next = {
    ...config,
    name,
    owner,
    version,
    // The scheme is hardcoded across links, share extensions, and auth callbacks.
    scheme: config.scheme ?? "rakazo",
    icon: SPARK_ICON,
    ios: {
      ...iosRest,
      bundleIdentifier: bundleId,
      appleTeamId: teamId,
      buildNumber,
      ...(infoPlist ? { infoPlist } : {}),
    },
    android: {
      ...config.android,
      package: androidPackage,
      versionCode,
      icon: SPARK_ICON,
      adaptiveIcon: {
        foregroundImage: SPARK_ICON,
        backgroundColor: SPARK_SPLASH_BACKGROUND,
      },
    },
    plugins: renamePlugins(config.plugins, name, appGroup),
    extra: {
      ...config.extra,
      spark: true,
      iosAppGroup: appGroup,
      sparkNotificationBundleIdentifier: notificationBundleId,
      eas: rewriteEas(config.extra?.eas, {
        previousBundleId,
        bundleId,
        appGroup,
        notificationBundleId,
        projectId,
      }),
    },
  };

  next =
    projectId === SPARK_EAS_PROJECT_PLACEHOLDER
      ? detachUpdates(next)
      : pointUpdates(next, projectId);

  if (jsonContains(next, UPSTREAM_EXPO_PROJECT_ID)) {
    throw new Error("SparkAI builds must not keep Rakazo's Expo project id.");
  }
  return next;
}

function rewriteEas(eas, ids) {
  const record = asRecord(eas) ?? {};
  const build = asRecord(record.build);
  const experimental = asRecord(build?.experimental);
  const ios = asRecord(experimental?.ios);
  const appExtensions = Array.isArray(ios?.appExtensions)
    ? ios.appExtensions
        .map((entry) => rewriteExtension(entry, ids))
        .filter((entry) => entry != null)
    : undefined;
  return {
    ...record,
    projectId: ids.projectId,
    ...(build
      ? {
          build: {
            ...build,
            ...(experimental
              ? {
                  experimental: {
                    ...experimental,
                    ...(ios
                      ? {
                          ios: {
                            ...ios,
                            ...(appExtensions ? { appExtensions } : {}),
                          },
                        }
                      : {}),
                  },
                }
              : {}),
          },
        }
      : {}),
  };
}

function rewriteExtension(entry, ids) {
  const ext = asRecord(entry);
  if (!ext) return entry;
  const targetName = typeof ext.targetName === "string" ? ext.targetName : "";
  const bundle = typeof ext.bundleIdentifier === "string" ? ext.bundleIdentifier : "";
  // The watch app is the Apple Watch entry. Spark builds leave it out.
  if (
    targetName === "RakazoWatch" ||
    targetName === "RakazoWatchComplications" ||
    bundle.includes(".watchkitapp")
  ) {
    return null;
  }
  const bundleIdentifier =
    typeof ext.bundleIdentifier === "string"
      ? nextExtensionId(ext.bundleIdentifier, ids)
      : undefined;
  const entitlements = asRecord(ext.entitlements);
  const groups = entitlements?.["com.apple.security.application-groups"];
  const nextEntitlements =
    entitlements && Array.isArray(groups)
      ? {
          ...entitlements,
          "com.apple.security.application-groups": groups.map((group) =>
            typeof group === "string" &&
            ids.previousBundleId &&
            group === `group.${ids.previousBundleId}`
              ? ids.appGroup
              : group,
          ),
        }
      : ext.entitlements;
  return {
    ...ext,
    ...(bundleIdentifier !== undefined ? { bundleIdentifier } : {}),
    ...(nextEntitlements !== undefined ? { entitlements: nextEntitlements } : {}),
  };
}

function nextExtensionId(bundleIdentifier, ids) {
  const previous = ids.previousBundleId;
  const isNotification =
    bundleIdentifier.endsWith(".notifications") ||
    (previous !== undefined && bundleIdentifier === `${previous}.notifications`);
  if (isNotification) return ids.notificationBundleId;
  if (previous && bundleIdentifier.startsWith(`${previous}.`)) {
    return `${ids.bundleId}${bundleIdentifier.slice(previous.length)}`;
  }
  return bundleIdentifier;
}

function renamePlugins(plugins, name, appGroup) {
  if (!plugins) return plugins;
  return plugins.flatMap((plugin) => {
    const id = Array.isArray(plugin) ? plugin[0] : plugin;
    if (id === "./plugins/with-apple-watch") return [];
    if (!Array.isArray(plugin)) return [plugin];
    const [, options] = plugin;
    if (!options || typeof options !== "object") return [plugin];
    const next = renamePermissionTree(options, name);
    if (id === "expo-sharing") {
      const ios = asRecord(next.ios) ?? {};
      next.ios = { ...ios, appGroupId: appGroup };
    }
    if (id === "expo-splash-screen") {
      next.image = SPARK_ICON;
      next.backgroundColor = SPARK_SPLASH_BACKGROUND;
      const dark = asRecord(next.dark);
      if (dark) next.dark = { ...dark, backgroundColor: SPARK_SPLASH_BACKGROUND };
    }
    return [[id, next]];
  });
}

function renamePermissionTree(value, name) {
  if (Array.isArray(value)) return value.map((entry) => renamePermissionTree(entry, name));
  if (!value || typeof value !== "object") return value;
  const out = {};
  for (const [key, child] of Object.entries(value)) {
    out[key] =
      typeof child === "string" && PERMISSION_KEYS.has(key)
        ? child.replaceAll("Rakazo", name)
        : renamePermissionTree(child, name);
  }
  return out;
}

function renamePlist(plist, name) {
  const record = asRecord(plist);
  if (!record) return undefined;
  const out = {};
  for (const [key, value] of Object.entries(record)) {
    out[key] = typeof value === "string" ? value.replaceAll("Rakazo", name) : value;
  }
  return out;
}

function detachUpdates(config) {
  if (!config.updates) return { ...config, updates: { enabled: false } };
  const { url: _url, ...rest } = config.updates;
  return { ...config, updates: { ...rest, enabled: false } };
}

function pointUpdates(config, projectId) {
  return {
    ...config,
    updates: { ...config.updates, enabled: true, url: `https://u.expo.dev/${projectId}` },
  };
}

function atLeastVersion(version, floor) {
  const current = version?.trim() || floor;
  return compareVersions(current, floor) >= 0 ? current : floor;
}

function compareVersions(left, right) {
  const a = left.split(".").map((part) => Number(part) || 0);
  const b = right.split(".").map((part) => Number(part) || 0);
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    const delta = (a[index] ?? 0) - (b[index] ?? 0);
    if (delta !== 0) return delta;
  }
  return 0;
}

function atLeastInt(value, floor) {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) {
    throw new Error(`SparkAI build number must be a positive integer (got ${String(value)}).`);
  }
  return Math.max(Math.trunc(parsed), floor);
}

function truthy(value) {
  const normalized = value?.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

function readEnv(env, name) {
  const value = env[name]?.trim();
  return value || undefined;
}

function asRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : undefined;
}

function jsonContains(value, needle) {
  return JSON.stringify(value).includes(needle);
}

module.exports = {
  SPARK_EAS_PROJECT_PLACEHOLDER,
  SPARK_EXPO_OWNER_PLACEHOLDER,
  applySparkBrand,
  sparkEnvEnabled,
};
