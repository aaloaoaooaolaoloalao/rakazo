import { describe, expect, it } from "vitest";
import {
  autoProvisionDefaultBotName,
  autoProvisionMaxComputersPerUser,
  autoProvisionNewUsersEnabled,
} from "./auto-provision.js";

describe("autoProvisionNewUsersEnabled", () => {
  it("defaults to enabled", () => {
    expect(autoProvisionNewUsersEnabled({})).toBe(true);
    expect(autoProvisionNewUsersEnabled({ AUTO_PROVISION_NEW_USERS: undefined })).toBe(true);
  });

  it("disables only when explicitly false", () => {
    expect(autoProvisionNewUsersEnabled({ AUTO_PROVISION_NEW_USERS: "false" })).toBe(false);
    expect(autoProvisionNewUsersEnabled({ AUTO_PROVISION_NEW_USERS: "true" })).toBe(true);
  });
});

describe("autoProvisionDefaultBotName", () => {
  it("uses the Hebrew default when unset", () => {
    expect(autoProvisionDefaultBotName({})).toBe("העוזר שלי");
  });

  it("respects AUTO_PROVISION_DEFAULT_BOT_NAME", () => {
    expect(autoProvisionDefaultBotName({ AUTO_PROVISION_DEFAULT_BOT_NAME: "Helper" })).toBe(
      "Helper",
    );
  });
});

describe("autoProvisionMaxComputersPerUser", () => {
  it("defaults to one computer", () => {
    expect(autoProvisionMaxComputersPerUser({})).toBe(1);
  });

  it("parses a non-negative integer", () => {
    expect(autoProvisionMaxComputersPerUser({ AUTO_PROVISION_MAX_COMPUTERS_PER_USER: "3" })).toBe(
      3,
    );
    expect(autoProvisionMaxComputersPerUser({ AUTO_PROVISION_MAX_COMPUTERS_PER_USER: "0" })).toBe(
      0,
    );
  });
});
