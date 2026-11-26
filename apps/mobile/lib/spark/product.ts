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
  return sparkShown(PRODUCT_UI.hideUserModelSettings);
}

export function showVoiceSettings(): boolean {
  return sparkShown(PRODUCT_UI.hideUserVoiceSettings);
}

export function showPasskeys(): boolean {
  return sparkShown(PRODUCT_UI.hidePasskeys);
}

export function showBilling(): boolean {
  return sparkShown(PRODUCT_UI.hideBilling);
}

export function showWallet(): boolean {
  return sparkShown(PRODUCT_UI.hideWallet);
}

export function showSpendingLimits(): boolean {
  return sparkShown(PRODUCT_UI.hideSpendingLimits);
}

export function showLabs(): boolean {
  return sparkShown(PRODUCT_UI.hideLabs);
}

export function showAppleWatch(): boolean {
  return sparkShown(PRODUCT_UI.hideAppleWatch);
}

export function showWidgets(): boolean {
  return sparkShown(PRODUCT_UI.hideWidgets);
}

export function showSignupSurvey(): boolean {
  return sparkShown(PRODUCT_UI.hideSignupSurvey);
}

export function showMeetings(): boolean {
  return sparkShown(PRODUCT_UI.hideMeetings);
}

export function showOrganizations(): boolean {
  return sparkShown(PRODUCT_UI.hideOrganizations);
}

function sparkShown(hidden: boolean): boolean {
  return !(sparkProductEnabled() && hidden);
}
