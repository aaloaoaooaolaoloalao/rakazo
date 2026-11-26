import { afterEach, describe, expect, it, vi } from "vitest";
import { showModelSettings, showPasskeys, showVoiceSettings, sparkProductEnabled } from "./product";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("Spark product surface", () => {
  it("keeps upstream mobile features when the Spark flag is off", () => {
    vi.stubEnv("SPARK", undefined);
    vi.stubEnv("EXPO_PUBLIC_SPARK", undefined);
    expect(sparkProductEnabled()).toBe(false);
    expect(showModelSettings()).toBe(true);
    expect(showVoiceSettings()).toBe(true);
    expect(showPasskeys()).toBe(true);
  });

  it("hides models, voice, and passkeys when the Spark flag is on", () => {
    vi.stubEnv("EXPO_PUBLIC_SPARK", "1");
    expect(sparkProductEnabled()).toBe(true);
    expect(showModelSettings()).toBe(false);
    expect(showVoiceSettings()).toBe(false);
    expect(showPasskeys()).toBe(false);
  });
});
