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
  /** Hide billing, the paywall, and upgrade actions. Mobile reads this; web does not. */
  hideBilling: true,
  /** Hide the payment wallet. Mobile reads this; web does not. */
  hideWallet: true,
  /** Hide spending limits. Mobile reads this; web does not. */
  hideSpendingLimits: true,
  /** Hide Labs and the Board shortcut. Mobile reads this; web does not. */
  hideLabs: true,
  /** Hide the Apple Watch companion. Mobile reads this; web does not. */
  hideAppleWatch: true,
  /** Hide widget settings. Mobile reads this; web does not. */
  hideWidgets: true,
  /** Hide the post-signup survey. Mobile reads this; web does not. */
  hideSignupSurvey: true,
  /** Hide meetings. Mobile reads this; web does not. */
  hideMeetings: true,
  /** Hide organization and Space management. Mobile reads this; web does not. */
  hideOrganizations: true,
} as const;
