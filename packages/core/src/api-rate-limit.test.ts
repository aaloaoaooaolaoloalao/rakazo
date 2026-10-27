import { describe, expect, it } from "vitest";
import {
  MemoryRateLedger,
  bucketLimit,
  rateBucket,
  readRateLimits,
} from "./api-rate-limit.js";

describe("api rate limit", () => {
  it("classifies each expensive bucket and leaves health out of the rpc paths", () => {
    expect(rateBucket("/rpc/threads/send")).toBe("send");
    expect(rateBucket("/rpc/artifacts/create")).toBe("artifact");
    expect(rateBucket("/rpc/connections/begin")).toBe("connect");
    expect(rateBucket("/rpc/messaging/send")).toBe("messaging");
    expect(rateBucket("/rpc/voice/status")).toBe("voice");
    expect(rateBucket("/rpc/usage/summary")).toBe("general");
  });

  it("uses the documented defaults", () => {
    const limits = readRateLimits({});
    expect(bucketLimit(limits, "general", true)).toBe(120);
    expect(bucketLimit(limits, "general", false)).toBe(300);
    expect(bucketLimit(limits, "send", true)).toBe(20);
    expect(bucketLimit(limits, "artifact", true)).toBe(20);
  });

  it("returns a 429 shape once the window is full and resets on the next minute", () => {
    const ledger = new MemoryRateLedger();
    const first = ledger.take("user:1", 1_000, 2);
    const second = ledger.take("user:1", 1_500, 2);
    const third = ledger.take("user:1", 2_000, 2);
    expect(first.allowed).toBe(true);
    expect(second.remaining).toBe(0);
    expect(third.allowed).toBe(false);
    expect(third.retryAfterSeconds).toBeGreaterThan(0);
    expect(ledger.take("user:1", 61_000, 2).allowed).toBe(true);
  });
});
