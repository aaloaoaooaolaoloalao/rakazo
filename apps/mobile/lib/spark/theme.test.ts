import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("expo-secure-store", () => ({
  getItemAsync: async () => null,
  setItemAsync: async () => undefined,
}));

vi.mock("react-native", () => ({
  Appearance: {
    getColorScheme: () => "dark",
    setColorScheme: () => undefined,
    addChangeListener: () => ({ remove() {} }),
  },
}));

import { mobileTokens } from "../appearance/appearance";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("Spark theme on mobile", () => {
  it("uses the upstream palette when the Spark flag is off", async () => {
    vi.stubEnv("SPARK", undefined);
    vi.stubEnv("EXPO_PUBLIC_SPARK", undefined);
    const { darkTokens } = await import("@rakazo/ui-tokens");
    expect(mobileTokens()).toBe(darkTokens);
  });

  it("keeps the upstream palette when the Spark flag is on", async () => {
    vi.stubEnv("EXPO_PUBLIC_SPARK", "1");
    const { darkTokens } = await import("@rakazo/ui-tokens");
    expect(mobileTokens()).toBe(darkTokens);
    expect(mobileTokens().primary).toBe(darkTokens.primary);
    expect(mobileTokens().link).toBe(darkTokens.link);
    expect(mobileTokens().ring).toBe(darkTokens.ring);
  });
});
