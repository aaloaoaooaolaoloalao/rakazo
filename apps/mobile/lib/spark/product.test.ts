import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  showActivity,
  showAppleWatch,
  showBilling,
  showLabs,
  showMeetings,
  showModelSettings,
  showOrganizations,
  showPasskeys,
  showSignupSurvey,
  showSpendingLimits,
  showVoiceSettings,
  showWallet,
  showWidgets,
  sparkProductEnabled,
} from "./product";

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
    expect(showBilling()).toBe(true);
    expect(showWallet()).toBe(true);
    expect(showSpendingLimits()).toBe(true);
    expect(showLabs()).toBe(true);
    expect(showAppleWatch()).toBe(true);
    expect(showWidgets()).toBe(true);
    expect(showSignupSurvey()).toBe(true);
    expect(showMeetings()).toBe(true);
    expect(showOrganizations()).toBe(true);
    expect(showActivity()).toBe(true);
  });

  it("reads the public flag Metro inlines, and ignores SPARK alone", () => {
    const source = readFileSync(new URL("./product.ts", import.meta.url), "utf8");
    expect(source).toContain("process.env.EXPO_PUBLIC_SPARK");
    vi.stubEnv("SPARK", "1");
    vi.stubEnv("EXPO_PUBLIC_SPARK", undefined);
    expect(sparkProductEnabled()).toBe(false);
    expect(showModelSettings()).toBe(true);
    expect(showBilling()).toBe(true);
  });

  it("hides the Spark extras when the Spark flag is on", () => {
    vi.stubEnv("EXPO_PUBLIC_SPARK", "1");
    expect(sparkProductEnabled()).toBe(true);
    expect(showModelSettings()).toBe(false);
    expect(showVoiceSettings()).toBe(false);
    expect(showPasskeys()).toBe(false);
    expect(showBilling()).toBe(false);
    expect(showWallet()).toBe(false);
    expect(showSpendingLimits()).toBe(false);
    expect(showLabs()).toBe(false);
    expect(showAppleWatch()).toBe(false);
    expect(showWidgets()).toBe(false);
    expect(showSignupSurvey()).toBe(false);
    expect(showMeetings()).toBe(false);
    expect(showOrganizations()).toBe(false);
    expect(showActivity()).toBe(false);
  });
});
