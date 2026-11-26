import { PRODUCT_UI } from "@rakazo/ui-tokens";
import { sparkEnvEnabled } from "./brand.js";

/**
 * True when this JS bundle was built for SparkAI.
 *
 * Metro inlines `EXPO_PUBLIC_SPARK`. The EAS spark profiles set it, and
 * `SPARK=1` alone is enough for `expo config` native ids. Set both for a
 * binary whose UI follows the brand. This module stays free of `expo-constants`
 * so node tests that import settings do not load React Native.
 */
export function sparkProductEnabled(): boolean {
  return sparkEnvEnabled();
}

export function showModelSettings(): boolean {
  return !(sparkProductEnabled() && PRODUCT_UI.hideUserModelSettings);
}

export function showVoiceSettings(): boolean {
  return !(sparkProductEnabled() && PRODUCT_UI.hideUserVoiceSettings);
}

export function showPasskeys(): boolean {
  return !(sparkProductEnabled() && PRODUCT_UI.hidePasskeys);
}
