import { describe, expect, it } from "vitest";
import {
  bucketLimit,
  DEFAULT_RATE_LIMITS,
  isFirstRejection,
  MemoryRateLedger,
  rateBucket,
  rateChecks,
  readRateLimits,
} from "./api-rate-limit.js";

describe("api rate limit", () => {
  it("classifies each expensive bucket and leaves health out of the rpc paths", () => {
    expect(rateBucket("/rpc/threads/send")).toBe("send");
    expect(rateBucket("/rpc/threads/sendWithRoutines")).toBe("send");
    expect(rateBucket("/rpc/artifacts/create")).toBe("artifact");
    expect(rateBucket("/rpc/connections/begin")).toBe("connect");
    expect(rateBucket("/rpc/messaging/send")).toBe("messaging");
    expect(rateBucket("/rpc/voice/start")).toBe("voice");
    expect(rateBucket("/rpc/health")).toBe("exempt");
  });

  it("puts polling reads and streams in their own buckets", () => {
    expect(rateBucket("/rpc/bots/list")).toBe("read");
    expect(rateBucket("/rpc/threads/messages")).toBe("read");
    expect(rateBucket("/rpc/usage/summary")).toBe("read");
    expect(rateBucket("/rpc/threads/subscribe")).toBe("stream");
    expect(rateBucket("/rpc/notifications/subscribeCalls")).toBe("stream");
    expect(rateBucket("/rpc/bots/update")).toBe("general");
  });

  it("limits auth attempts separately and treats session reads as reads", () => {
    expect(rateBucket("/api/auth/sign-in/social")).toBe("auth");
    expect(rateBucket("/api/auth/sign-up/email")).toBe("auth");
    expect(rateBucket("/api/auth/get-session")).toBe("read");
    expect(rateBucket("/api/v1/bots/hook")).toBe("exempt");
    expect(rateBucket("/api/feedback/bug-reports")).toBe("bug_report");
  });

  it("uses the documented defaults and env overrides", () => {
    const limits = readRateLimits({});
    expect(limits).toEqual(DEFAULT_RATE_LIMITS);
    expect(bucketLimit(limits, "general", true)).toBe(600);
    expect(bucketLimit(limits, "general", false)).toBe(300);
    expect(bucketLimit(limits, "read", true)).toBe(1200);
    expect(bucketLimit(limits, "auth", false)).toBe(60);
    expect(bucketLimit(limits, "send", true)).toBe(20);
    expect(readRateLimits({ API_RATE_LIMIT_AUTH_PER_MINUTE: "5" }).authPerMinute).toBe(5);
    expect(readRateLimits({ API_RATE_LIMIT_PER_MINUTE_USER: "nope" }).userPerMinute).toBe(600);
  });

  it("counts signed-in traffic per user and per address, signed-out and auth per address", () => {
    const limits = readRateLimits({});
    expect(rateChecks(limits, "general", "u1", "1.2.3.4").map((c) => [c.key, c.limit])).toEqual([
      ["general:user:u1", 600],
      ["all:ip:1.2.3.4", 3000],
    ]);
    expect(rateChecks(limits, "general", undefined, "1.2.3.4").map((c) => c.key)).toEqual([
      "general:ip:1.2.3.4",
    ]);
    expect(rateChecks(limits, "auth", undefined, "1.2.3.4")).toEqual([
      { key: "auth:ip:1.2.3.4", scope: "ip", limit: 60, windowMs: 60_000 },
    ]);
    expect(rateChecks(limits, "exempt", "u1", "1.2.3.4")).toEqual([]);
    expect(rateChecks(limits, "bug_report", "u1", "ip")[0]?.windowMs).toBe(3_600_000);
  });

  it("never limits a busy iOS session: launch burst plus 4 screens polling every 2s", () => {
    const limits = readRateLimits({});
    const ledger = new MemoryRateLedger();
    const userLimit = bucketLimit(limits, "read", true);
    let rejected = 0;
    // 60 launch reads, then 4 pollers at 2s plus stream reconnects every 5s, for a minute.
    for (let i = 0; i < 60; i++)
      if (!ledger.take("read:user:u", 1_000, userLimit).allowed) rejected++;
    for (let t = 0; t < 60_000; t += 2_000) {
      for (let s = 0; s < 4; s++) if (!ledger.take("read:user:u", t, userLimit).allowed) rejected++;
    }
    const streamLimit = bucketLimit(limits, "stream", true);
    for (let t = 0; t < 60_000; t += 5_000) {
      if (!ledger.take("stream:user:u", t, streamLimit).allowed) rejected++;
    }
    expect(rejected).toBe(0);
  });

  it("records only the first rejection in a window", () => {
    expect(isFirstRejection(20, 20)).toBe(false);
    expect(isFirstRejection(21, 20)).toBe(true);
    expect(isFirstRejection(400, 20)).toBe(false);
    expect(isFirstRejection(1, 0)).toBe(false);
  });

  it("returns a 429 shape once the window is full and resets on the next window", () => {
    const ledger = new MemoryRateLedger();
    const first = ledger.take("user:1", 1_000, 2);
    const second = ledger.take("user:1", 1_500, 2);
    const third = ledger.take("user:1", 2_000, 2);
    expect(first.allowed).toBe(true);
    expect(second.remaining).toBe(0);
    expect(third.allowed).toBe(false);
    expect(third.retryAfterSeconds).toBe(58);
    expect(ledger.take("user:1", 61_000, 2).allowed).toBe(true);
    expect(ledger.take("hour", 0, 1, 3_600_000).allowed).toBe(true);
    expect(ledger.take("hour", 1_800_000, 1, 3_600_000).retryAfterSeconds).toBe(1800);
  });
});
