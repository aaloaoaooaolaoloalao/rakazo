/**
 * Product-specific web UI toggles. Flip these to re-expose upstream Rakazo settings
 * without deleting the underlying panels.
 */
export const PRODUCT_UI = {
  /** Hide Models in user settings (SettingsOverlay nav + deep links). */
  hideUserModelSettings: true,
  /** Hide Voice in user settings (SettingsOverlay nav + deep links). */
  hideUserVoiceSettings: true,
} as const;
