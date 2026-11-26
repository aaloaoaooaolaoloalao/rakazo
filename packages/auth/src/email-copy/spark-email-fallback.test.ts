import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { modelConnectionEmail } from "../model-connection-email.js";
import { referralEmail } from "../referral-email.js";
import { welcomeEmail } from "../welcome-email.js";
import { emailCopy, emailCopyAvailable } from "./deployment-copy.js";

const user = { id: "user-1", name: "Ana", email: "ana@example.test" };
const unsubscribe = "https://example.test/unsubscribe";

describe("lifecycle email without a complete copy directory", () => {
  beforeEach(() => {
    vi.stubEnv("EMAIL_COPY_DIR", "");
  });

  it("sends the in-code SparkAI English for welcome, referral, and model connection", async () => {
    expect(emailCopyAvailable("welcome")).toBe(true);
    expect(emailCopyAvailable("referral")).toBe(true);
    expect(emailCopyAvailable("model-connection")).toBe(true);
    expect(emailCopyAvailable("agent-import")).toBe(false);

    const welcome = await welcomeEmail(user, unsubscribe);
    expect(welcome.subject).toBe("Welcome to SparkAI");
    expect(welcome.text).toContain(
      "Welcome to SparkAI. The people who get the most out of it do three things:",
    );
    expect(welcome.text).toContain("Get the apps");
    expect(welcome.text).toContain("Elie");

    const referral = await referralEmail(user, "https://example.test/invite", unsubscribe);
    expect(referral.subject).toBe("Invite a friend");
    expect(referral.text).toContain("Invite a friend to SparkAI");
    expect(referral.text).toContain("Open SparkAI");

    const model = await modelConnectionEmail(user, {
      webOrigin: "https://example.test",
      unsubscribeUrl: unsubscribe,
    });
    expect(model.subject).toBe("Connect a model to start using SparkAI");
    expect(model.text).toContain("your bots can't reply until a model is connected");
    expect(model.text).toContain("Connect a model");
  });

  it("uses that English when the copy files are incomplete", async () => {
    const dir = mkdtempSync(join(tmpdir(), "email-copy-"));
    writeFileSync(join(dir, "welcome.json"), JSON.stringify({ en: { subject: "Only a subject" } }));
    writeFileSync(join(dir, "referral.json"), "{");
    vi.stubEnv("EMAIL_COPY_DIR", dir);
    expect(emailCopy("welcome", "de")("subject")).toBe("Welcome to SparkAI");
    const referral = await referralEmail(user, "https://example.test/invite", unsubscribe, "de");
    expect(referral.subject).toBe("Invite a friend");
    expect(emailCopyAvailable("model-connection")).toBe(true);
    const model = await modelConnectionEmail(
      user,
      { webOrigin: "https://example.test", unsubscribeUrl: unsubscribe },
      "de",
    );
    expect(model.subject).toBe("Connect a model to start using SparkAI");
  });
});
