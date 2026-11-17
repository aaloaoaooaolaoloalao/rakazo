import { describe, expect, it } from "vitest";
import { configuredEmailProvider, DEFAULT_RESEND_FROM } from "./email.js";

const smtp = { smtpUrl: "smtps://smtp.example.test", emailFrom: "hello@example.test" };

describe("configuredEmailProvider", () => {
  it("keeps email optional and existing SMTP configurations working", () => {
    expect(configuredEmailProvider({ smtpUrl: undefined, emailFrom: undefined })).toBeUndefined();
    expect(configuredEmailProvider(smtp)?.describe().id).toBe("smtp");
    expect(configuredEmailProvider({ ...smtp, emailProvider: "none" })).toBeUndefined();
  });

  it("selects the Resend API explicitly even with old SMTP settings present", () => {
    expect(
      configuredEmailProvider({
        ...smtp,
        emailProvider: "resend",
        emailApiKey: "fake-key",
      })?.describe().id,
    ).toBe("resend");
  });

  it("selects Resend from a key alone and falls back to the SparkAI sender", () => {
    const provider = configuredEmailProvider({
      smtpUrl: undefined,
      emailFrom: undefined,
      emailApiKey: "fake-key",
    });
    expect(provider?.describe().id).toBe("resend");
    expect(DEFAULT_RESEND_FROM).toBe("SparkAI <no-reply@homesserver.work>");
  });

  it("rejects unknown or incomplete configurations instead of disabling recovery silently", () => {
    expect(() => configuredEmailProvider({ ...smtp, emailProvider: "typo" })).toThrow(
      "EMAIL_PROVIDER",
    );
    expect(() => configuredEmailProvider({ ...smtp, emailProvider: "resend" })).toThrow(
      "EMAIL_API_KEY",
    );
    expect(() =>
      configuredEmailProvider({ smtpUrl: undefined, emailFrom: undefined, emailProvider: "smtp" }),
    ).toThrow("SMTP_URL");
  });
});
