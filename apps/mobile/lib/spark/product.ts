import { PRODUCT_UI } from "@rakazo/ui-tokens";

/**
 * True when this JS bundle was built for SparkAI.
 *
 * The member access below has to stay written as `process.env.EXPO_PUBLIC_SPARK`.
 * Metro inlines that exact form into the release bundle. A lookup through
 * `process.env` as a value, or through `SPARK` alone, is empty on device:
 * EAS sets `EXPO_PUBLIC_SPARK` in the spark profiles, and that is the flag
 * the UI reads. Native ids still follow `SPARK` in `app.config.ts`.
 * This module stays free of `expo-constants` so node tests do not load React Native.
 */
export function sparkProductEnabled(): boolean {
  return sparkPublicFlag(process.env.EXPO_PUBLIC_SPARK);
}

function sparkPublicFlag(value: string | undefined): boolean {
  const normalized = value?.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
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
