import { describe, expect, it } from "vitest";
import {
  AGENT_CAPABILITY_PROCEDURES,
  agentsRequireVerifiedEmail,
  procedureRequiresVerifiedEmail,
  transactionalEmailConfigured,
} from "./agent-email-verification.js";

describe("agentsRequireVerifiedEmail", () => {
  it("defaults off without email delivery configured", () => {
    expect(agentsRequireVerifiedEmail({})).toBe(false);
    expect(agentsRequireVerifiedEmail({ EMAIL_PROVIDER: "none" })).toBe(false);
  });

  it("defaults on when email can be sent", () => {
    expect(agentsRequireVerifiedEmail({ EMAIL_PROVIDER: "resend", EMAIL_FROM: "a@b.test" })).toBe(
      true,
    );
    expect(agentsRequireVerifiedEmail({ SMTP_URL: "smtp://localhost" })).toBe(true);
  });

  it("honors REQUIRE_VERIFIED_EMAIL_FOR_AGENTS override", () => {
    expect(agentsRequireVerifiedEmail({ REQUIRE_VERIFIED_EMAIL_FOR_AGENTS: "true" })).toBe(true);
    expect(
      agentsRequireVerifiedEmail({
        REQUIRE_VERIFIED_EMAIL_FOR_AGENTS: "false",
        EMAIL_PROVIDER: "resend",
      }),
    ).toBe(false);
  });
});

describe("procedureRequiresVerifiedEmail", () => {
  it("covers agent and computer boot paths", () => {
    expect(procedureRequiresVerifiedEmail(["threads", "send"])).toBe(true);
    expect(procedureRequiresVerifiedEmail(["computer", "boot"])).toBe(true);
    expect(procedureRequiresVerifiedEmail(["bots", "list"])).toBe(false);
    expect(AGENT_CAPABILITY_PROCEDURES.has("threads.send")).toBe(true);
  });
});

describe("transactionalEmailConfigured", () => {
  it("detects resend and smtp", () => {
    expect(transactionalEmailConfigured({ EMAIL_PROVIDER: "resend", EMAIL_API_KEY: "re_xxx" })).toBe(
      true,
    );
    expect(transactionalEmailConfigured({ SMTP_URL: "smtp://localhost" })).toBe(true);
  });
});
