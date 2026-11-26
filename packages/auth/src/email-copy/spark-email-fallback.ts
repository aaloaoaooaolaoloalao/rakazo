import { translate } from "@rakazo/core";
import type { EmailCopyId } from "./email-keys.js";

/**
 * English SparkAI wording for the lifecycle emails. A deployment copy directory
 * replaces these; without a complete file the mail still sends this text.
 */
const SPARK_EMAIL_FALLBACK: Partial<Record<EmailCopyId, Record<string, string>>> = {
  welcome: {
    subject: "Welcome to SparkAI",
    intro: "Welcome to SparkAI. The people who get the most out of it do three things:",
    appsTitle: "Get the apps",
    apps: "SparkAI runs on {platforms}, so your bots can reach you wherever you are.",
    communityTitle: "Join the community",
    community:
      "See what others are building, get help fast, and tell us what to build next on {discord}.",
    starTitle: "Star us on GitHub",
    star: "SparkAI is open source. {star} helps more people find it.",
    starLink: "A star on GitHub",
    closing: "Questions? Just reply. I read every one.",
    signature: "Elie",
  },
  referral: {
    subject: "Invite a friend",
    body: "Invite a friend to SparkAI: they get {weeks} weeks free, and you earn a free month when they start a qualifying subscription with a new card.",
    link: "Open SparkAI",
    afterLink:
      "and choose Invite friends for your link. Have any questions? Just reply to this email. If you're enjoying SparkAI, give us a star on GitHub.",
    signature: "Elie",
  },
  "model-connection": {
    subject: "Connect a model to start using SparkAI",
    intro: "Your SparkAI plan has started, but your bots can't reply until a model is connected.",
    connect: "Sign in with your {subscriptions} subscription, or paste an API key.",
    button: "Connect a model",
  },
};

export function sparkEmailFallback(
  id: EmailCopyId,
): ((key: string, values?: Record<string, string | number>) => string) | undefined {
  const strings = SPARK_EMAIL_FALLBACK[id];
  if (!strings) return undefined;
  return (key, values) => {
    const text = strings[key];
    if (text === undefined) throw new Error(`The ${id} email has no copy`);
    return translate(undefined, text, values);
  };
}
