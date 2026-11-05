import { describe, expect, it } from "vitest";
import {
  authCredentialEmailRateKey,
  authCredentialEmailRetryAfterSeconds,
  AUTH_CREDENTIAL_EMAIL_MAX,
  AUTH_CREDENTIAL_EMAIL_WINDOW_MS,
} from "./auth-email-rate-bucket.js";

describe("authCredentialEmailRateKey", () => {
  it("normalizes email", () => {
    expect(authCredentialEmailRateKey("  User@Example.TEST ")).toBe("auth-email:user@example.test");
  });
});

describe("authCredentialEmailRetryAfterSeconds", () => {
  it("allows up to max attempts", () => {
    expect(authCredentialEmailRetryAfterSeconds(AUTH_CREDENTIAL_EMAIL_MAX, 0)).toBeNull();
    expect(authCredentialEmailRetryAfterSeconds(AUTH_CREDENTIAL_EMAIL_MAX + 1, 0)).toBeGreaterThan(
      0,
    );
  });

  it("returns seconds until window end when over limit", () => {
    const elapsed = AUTH_CREDENTIAL_EMAIL_WINDOW_MS - 30_000;
    const retry = authCredentialEmailRetryAfterSeconds(AUTH_CREDENTIAL_EMAIL_MAX + 1, elapsed);
    expect(retry).toBeGreaterThanOrEqual(29);
    expect(retry).toBeLessThanOrEqual(30);
  });
});
