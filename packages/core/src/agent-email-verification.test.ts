import { describe, expect, it } from "vitest";
import {
  AGENT_CAPABILITY_PROCEDURES,
  agentsRequireVerifiedEmail,
  EMAIL_VERIFICATION_REQUIRED_RUN_ERROR,
  isRoutineTurnOffOnly,
  procedureRequiresVerifiedEmail,
  transactionalEmailConfigured,
  workerAgentsRequireVerifiedEmail,
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
    expect(
      transactionalEmailConfigured({ EMAIL_PROVIDER: "resend", EMAIL_API_KEY: "re_xxx" }),
    ).toBe(true);
    expect(transactionalEmailConfigured({ SMTP_URL: "smtp://localhost" })).toBe(true);
    expect(transactionalEmailConfigured({ RESEND_API_KEY: "re_xxx" })).toBe(true);
  });
});

describe("workerAgentsRequireVerifiedEmail", () => {
  it("is on only when the flag says so explicitly", () => {
    expect(workerAgentsRequireVerifiedEmail({})).toBe(false);
    expect(workerAgentsRequireVerifiedEmail({ EMAIL_PROVIDER: "resend" })).toBe(false);
    expect(workerAgentsRequireVerifiedEmail({ REQUIRE_VERIFIED_EMAIL_FOR_AGENTS: "false" })).toBe(
      false,
    );
    expect(workerAgentsRequireVerifiedEmail({ REQUIRE_VERIFIED_EMAIL_FOR_AGENTS: " TRUE " })).toBe(
      true,
    );
    expect(workerAgentsRequireVerifiedEmail({ REQUIRE_VERIFIED_EMAIL_FOR_AGENTS: "1" })).toBe(true);
  });

  it("names the code first in the run error", () => {
    expect(EMAIL_VERIFICATION_REQUIRED_RUN_ERROR.startsWith("EMAIL_VERIFICATION_REQUIRED:")).toBe(
      true,
    );
  });
});

describe("gated agent procedures", () => {
  it.each([
    "threads.followUp",
    "threads.react",
    "routines.create",
    "routines.update",
    "skills.start",
    "mcp.assignments.approve",
    "groups.create",
    "groups.duplicate",
    "bots.setComputer",
    "computer.takeover",
    "computer.input",
  ])("gates %s", (name) => {
    expect(procedureRequiresVerifiedEmail(name.split("."), { routineId: "r", prompt: "x" })).toBe(
      true,
    );
  });

  it.each([
    "routines.remove",
    "routines.list",
    "bots.archive",
    "bots.remove",
    "computer.stop",
    "account.me",
  ])("leaves %s open", (name) => {
    expect(procedureRequiresVerifiedEmail(name.split("."))).toBe(false);
  });

  it("lets an update that only pauses a routine or turns its triggers off through", () => {
    const update = ["routines", "update"];
    expect(procedureRequiresVerifiedEmail(update, { routineId: "r", active: false })).toBe(false);
    expect(
      procedureRequiresVerifiedEmail(update, {
        routineId: "r",
        webhookEnabled: false,
        githubEnabled: false,
      }),
    ).toBe(false);
    expect(procedureRequiresVerifiedEmail(update, { routineId: "r", active: true })).toBe(true);
    expect(
      procedureRequiresVerifiedEmail(update, { routineId: "r", active: false, prompt: "new" }),
    ).toBe(true);
    expect(procedureRequiresVerifiedEmail(update, { routineId: "r" })).toBe(true);
    expect(isRoutineTurnOffOnly(null)).toBe(false);
  });
});
