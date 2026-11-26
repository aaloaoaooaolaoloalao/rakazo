import type { ExpoConfig } from "expo/config";
import { afterEach, describe, expect, it, vi } from "vitest";
import appConfig from "../../app.config";
import {
  applySparkBrand,
  SPARK_EAS_PROJECT_ID,
  SPARK_EXPO_OWNER,
  SPARK_SLUG,
  sparkEnvEnabled,
} from "./brand.js";

afterEach(() => {
  vi.unstubAllEnvs();
  delete process.env.EXPO_PUBLIC_SPARK;
});

const upstream: ExpoConfig = {
  name: "Rakazo",
  slug: "rakazo",
  owner: "inbox-zero",
  scheme: "rakazo",
  version: "1.0.0",
  icon: "./assets/icon.png",
  plugins: [
    [
      "expo-splash-screen",
      {
        image: "./assets/splash-icon.png",
        backgroundColor: "#FCFCFC",
        dark: { backgroundColor: "#141414" },
      },
    ],
    [
      "expo-audio",
      { microphonePermission: "Rakazo uses the microphone for voice calls with your bots." },
    ],
    ["expo-sharing", { ios: { enabled: true, appGroupId: "group.com.rakazo.app" } }],
    "./plugins/with-apple-watch",
    "./plugins/with-app-intents",
  ],
  ios: {
    bundleIdentifier: "com.rakazo.app",
    buildNumber: "1",
    icon: "../../packages/ui-tokens/assets/Rakazo.icon",
    infoPlist: {
      NSCameraUsageDescription: "Rakazo uses the camera so you can attach photos to a bot message.",
      UIBackgroundModes: ["voip"],
    },
  },
  android: { package: "com.rakazo.app", versionCode: 3 },
  extra: {
    eas: {
      projectId: "07f7eb04-45e3-47fe-9374-99a2f991131e",
      build: {
        experimental: {
          ios: {
            appExtensions: [
              {
                targetName: "AgentNotifications",
                bundleIdentifier: "com.rakazo.app.notifications",
                entitlements: {
                  "com.apple.developer.usernotifications.communication": true,
                },
              },
              {
                targetName: "RakazoWidgets",
                bundleIdentifier: "com.rakazo.app.widgets",
              },
              {
                targetName: "RakazoWatch",
                bundleIdentifier: "com.rakazo.app.watchkitapp",
                entitlements: {
                  "com.apple.security.application-groups": ["group.com.rakazo.app"],
                },
              },
            ],
          },
        },
      },
    },
  },
  updates: { url: "https://u.expo.dev/07f7eb04-45e3-47fe-9374-99a2f991131e" },
};

describe("SparkAI brand overlay", () => {
  it("leaves upstream config untouched when the Spark flag is off", () => {
    expect(sparkEnvEnabled({})).toBe(false);
    expect(applySparkBrand(upstream, {})).toBe(upstream);
  });

  it("applies SparkAI ids and keeps the rakazo scheme", () => {
    const branded = applySparkBrand(upstream, { SPARK: "1" });

    expect(branded.name).toBe("SparkAI");
    expect(branded.slug).toBe(SPARK_SLUG);
    expect(branded.slug).toBe("sparkai-");
    expect(branded.scheme).toBe("rakazo");
    expect(branded.version).toBe("3.0.1");
    expect(branded.owner).toBe(SPARK_EXPO_OWNER);
    expect(branded.owner).toBe("alolololololols-team");
    expect(branded.ios).toMatchObject({
      bundleIdentifier: "com.alonshelly.sparkai",
      appleTeamId: "WNAP7G2A58",
      buildNumber: "10",
    });
    expect(branded.ios).not.toHaveProperty("icon");
    expect(branded.android).toMatchObject({
      package: "com.alonshelly.sparkai",
      versionCode: 10,
    });
    expect(branded.extra).toMatchObject({
      spark: true,
      iosAppGroup: "group.com.alonshelly.sparkai",
      sparkNotificationBundleIdentifier: "com.alonshelly.sparkai.notification",
    });
    expect(JSON.stringify(branded)).not.toContain("07f7eb04-45e3-47fe-9374-99a2f991131e");
    expect(branded.extra?.eas).toMatchObject({ projectId: SPARK_EAS_PROJECT_ID });
    expect(branded.extra?.eas).toMatchObject({
      projectId: "ee5459ca-1aee-469a-bfb6-cd1155216e1f",
    });
    expect(branded.updates).toMatchObject({
      enabled: true,
      url: "https://u.expo.dev/ee5459ca-1aee-469a-bfb6-cd1155216e1f",
    });

    const eas = branded.extra?.eas as {
      build: { experimental: { ios: { appExtensions: { bundleIdentifier: string }[] } } };
    };
    const extensions = eas.build.experimental.ios.appExtensions;
    expect(extensions.map((entry) => entry.bundleIdentifier)).toEqual([
      "com.alonshelly.sparkai.notification",
      "com.alonshelly.sparkai.widgets",
    ]);
    expect(branded.plugins).not.toContain("./plugins/with-apple-watch");
    expect(branded.plugins).toContain("./plugins/with-app-intents");
    expect(branded.ios?.infoPlist?.NSCameraUsageDescription).toBe(
      "SparkAI uses the camera so you can attach photos to a bot message.",
    );
    const sharing = branded.plugins?.find(
      (plugin) => Array.isArray(plugin) && plugin[0] === "expo-sharing",
    );
    expect(Array.isArray(sharing) ? sharing[1] : undefined).toMatchObject({
      ios: { appGroupId: "group.com.alonshelly.sparkai" },
    });
    const splash = branded.plugins?.find(
      (plugin) => Array.isArray(plugin) && plugin[0] === "expo-splash-screen",
    );
    expect(Array.isArray(splash) ? splash[1] : undefined).toMatchObject({
      image: "../../apps/web/public/icon-512.png",
      backgroundColor: "#ECEAE2",
    });
  });

  it("lets env raise the version, build, project, and owner above the defaults", () => {
    const branded = applySparkBrand(upstream, {
      EXPO_PUBLIC_SPARK: "true",
      SPARK_APP_VERSION: "3.1.0",
      SPARK_IOS_BUILD_NUMBER: "4",
      SPARK_ANDROID_VERSION_CODE: "12",
      SPARK_EAS_PROJECT_ID: "spark-project",
      SPARK_EXPO_OWNER: "spark-owner",
    });

    expect(branded.version).toBe("3.1.0");
    expect(branded.ios?.buildNumber).toBe("10");
    expect(branded.android?.versionCode).toBe(12);
    expect(branded.owner).toBe("spark-owner");
    expect(branded.extra?.eas).toMatchObject({ projectId: "spark-project" });
    expect(branded.updates).toMatchObject({
      enabled: true,
      url: "https://u.expo.dev/spark-project",
    });
  });

  it("flows through app config without the flag and with it", () => {
    vi.stubEnv("EAS_BUILD_PROFILE", "development");
    vi.stubEnv("EXPO_PUBLIC_API_URL", undefined);
    vi.stubEnv("SPARK", undefined);
    vi.stubEnv("EXPO_PUBLIC_SPARK", undefined);
    const plain = {
      name: "Rakazo",
      slug: "rakazo",
      scheme: "rakazo",
      ios: { bundleIdentifier: "com.rakazo.app" },
    } satisfies ExpoConfig;

    expect(
      appConfig({ config: plain, projectRoot: "/", staticConfigPath: null, packageJsonPath: null }),
    ).toBe(plain);

    vi.stubEnv("SPARK", "1");
    vi.stubEnv("EXPO_PUBLIC_API_URL", "https://app.example.com");
    const branded = appConfig({
      config: upstream,
      projectRoot: "/",
      staticConfigPath: null,
      packageJsonPath: null,
    });
    expect(branded.name).toBe("SparkAI");
    expect(branded.slug).toBe("sparkai-");
    expect(branded.owner).toBe("alolololololols-team");
    expect(branded.scheme).toBe("rakazo");
    expect(branded.ios?.bundleIdentifier).toBe("com.alonshelly.sparkai");
    expect(branded.ios?.associatedDomains).toEqual(["webcredentials:app.example.com"]);
    expect(JSON.stringify(branded)).not.toContain("07f7eb04");
  });
});
