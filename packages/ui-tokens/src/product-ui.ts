/**
 * Product UI toggles shared by web and mobile.
 *
 * Web reads the model and voice flags directly, so those stay on for the Spark
 * product. Mobile applies every flag only while the Spark build is on, so an
 * upstream Rakazo binary keeps the screens.
 */
export const PRODUCT_UI = {
  /** Hide Models in user settings. */
  hideUserModelSettings: true,
  /** Hide Voice in user settings. */
  hideUserVoiceSettings: true,
  /** Hide passkey sign-in and the passkey list. Mobile reads this; web does not. */
  hidePasskeys: true,
} as const;
