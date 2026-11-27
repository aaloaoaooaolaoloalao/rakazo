import { afterEach, describe, expect, it, vi } from "vitest";
import { sparkProductEnabled } from "./spark-product.js";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("sparkProductEnabled", () => {
  it("is off when unset", () => {
    vi.stubEnv("SPARK", undefined);
    vi.stubEnv("EXPO_PUBLIC_SPARK", undefined);
    expect(sparkProductEnabled()).toBe(false);
  });

  it.each(["1", "true", "yes", " TRUE "])("is on for SPARK=%j", (value) => {
    vi.stubEnv("SPARK", value);
    expect(sparkProductEnabled()).toBe(true);
  });
});