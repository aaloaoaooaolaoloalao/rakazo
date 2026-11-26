import { describe, expect, it } from "vitest";
import { darkTokens, lightTokens, webDarkTokens, webLightTokens } from "./index.js";
import { applySparkMobileTokens, sparkDarkAccent, sparkLightAccent } from "./spark-overlay.js";

describe("Spark mobile token overlay", () => {
  it("uses the Spark web accent and leaves the ink primary alone", () => {
    expect(sparkDarkAccent.link).toBe(webDarkTokens.link);
    expect(sparkDarkAccent.ring).toBe(webDarkTokens.ring);
    expect(sparkLightAccent.link).toBe(webLightTokens.link);
    expect(sparkLightAccent.ring).toBe(webLightTokens.ring);

    const dark = applySparkMobileTokens(darkTokens, "dark");
    const light = applySparkMobileTokens(lightTokens, "light");
    expect(dark.link).toBe(webDarkTokens.link);
    expect(dark.primary).toBe(darkTokens.primary);
    expect(dark.background).toBe(darkTokens.background);
    expect(light.ring).toBe(webLightTokens.ring);
    expect(light.primary).toBe(lightTokens.primary);
    expect(light.background).toBe(lightTokens.background);
  });
});
