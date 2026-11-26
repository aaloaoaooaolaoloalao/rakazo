import { sparkDarkAccent } from "@rakazo/ui-tokens";
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
  it("keeps the upstream palette until the Spark flag is on", async () => {
    vi.stubEnv("SPARK", undefined);
    vi.stubEnv("EXPO_PUBLIC_SPARK", undefined);
    const { darkTokens } = await import("@rakazo/ui-tokens");
    expect(mobileTokens()).toBe(darkTokens);
  });

  it("applies the Spark web accent when the flag is on", () => {
    vi.stubEnv("EXPO_PUBLIC_SPARK", "1");
    expect(mobileTokens().link).toBe(sparkDarkAccent.link);
    expect(mobileTokens().ring).toBe(sparkDarkAccent.ring);
    expect(mobileTokens().primary).toBe("#FFFFFF");
  });
});
