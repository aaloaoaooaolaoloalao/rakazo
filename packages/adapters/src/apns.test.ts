import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  allowApnsSend,
  apnsAlertBody,
  apnsEnvironmentFor,
  apnsHost,
  buildApnsPayload,
  classifyApnsError,
  createApnsJwt,
  readApnsConfig,
} from "./apns.js";

const { privateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();

describe("apns", () => {
  it("builds an ES256 JWT with the key id and team", () => {
    const jwt = createApnsJwt(
      { key: pem, keyId: "JY397AHMY9", teamId: "WNAP7G2A58", topic: "com.alonshelly.sparkai", environment: "sandbox" },
      Date.parse("2026-10-27T12:00:00Z"),
    );
    const parts = jwt.split(".");
    const header = JSON.parse(Buffer.from(parts[0] ?? "", "base64url").toString());
    const claims = JSON.parse(Buffer.from(parts[1] ?? "", "base64url").toString());
    expect(header).toMatchObject({ alg: "ES256", kid: "JY397AHMY9" });
    expect(claims).toMatchObject({ iss: "WNAP7G2A58", iat: 1793102400 });
    expect(jwt.split(".")).toHaveLength(3);
  });

  it("builds a collapsed alert and hides a sealed body", () => {
    const payload = buildApnsPayload(
      { kind: "help", title: "Nova", body: "sealed secret", botId: "bot", threadId: "thread" },
      "space",
    );
    expect(payload.aps.alert.body).toBe("הודעה חדשה");
    expect(payload.aps["thread-id"]).toBe("thread");
    expect(payload.threadId).toBe("thread");
    expect(apnsAlertBody("הסוכן סיים")).toBe("הסוכן סיים");
  });

  it("drops a dead device and retries a server error once", () => {
    expect(classifyApnsError(410, "Unregistered")).toBe("drop");
    expect(classifyApnsError(400, "BadDeviceToken")).toBe("drop");
    expect(classifyApnsError(503, "Shutdown")).toBe("retry");
    expect(classifyApnsError(400, "BadTopic")).toBe("ignore");
  });

  it("sends a sandbox token to the sandbox host", () => {
    expect(apnsEnvironmentFor("sandbox", "production")).toBe("sandbox");
    expect(apnsEnvironmentFor(null, "production")).toBe("production");
    expect(apnsHost("sandbox")).toBe("https://api.sandbox.push.apple.com");
    expect(apnsHost("production")).toBe("https://api.push.apple.com");
  });

  it("stays disabled without a key and collapses a chatty thread", () => {
    expect(readApnsConfig({})).toBeUndefined();
    expect(allowApnsSend("user", "thread", 1_000)).toBe(true);
    expect(allowApnsSend("user", "thread", 2_000)).toBe(false);
    expect(allowApnsSend("user", "thread", 30_000)).toBe(true);
  });
});
