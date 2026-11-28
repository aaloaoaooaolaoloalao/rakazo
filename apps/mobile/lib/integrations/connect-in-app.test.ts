import type { Connection } from "@rakazo/contracts";
import { deferred } from "@rakazo/core/test-async";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { connectInApp } from "./connect-in-app";

const item = {
  connectorId: "test",
  slug: "example",
  name: "Example app",
  logo: null,
  connected: false,
  noAuth: false,
};
const row = (status: Connection["status"]): Connection => ({
  id: "connection-a",
  connectorId: "test",
  provider: "example",
  displayName: "Example app",
  status,
  capabilities: [],
  createdAt: "2026-01-01",
});

function setup(statuses: Connection["status"][]) {
  const page = deferred<unknown>();
  const deps = {
    begin: vi.fn().mockResolvedValue({
      connectionId: "connection-a",
      authorizationUrl: "https://sign-in.test",
    }),
    complete: vi.fn(async () => row(statuses.shift() ?? "pending")),
    revoke: vi.fn().mockResolvedValue({ ok: true }),
    openBrowser: vi.fn(() => page.promise),
    closeBrowser: vi.fn(() => page.resolve({ type: "dismiss" })),
    signal: new AbortController().signal,
  };
  return { deps, page };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

it("closes the sign-in page by itself once the account is connected", async () => {
  const { deps } = setup(["pending", "connected"]);
  const result = connectInApp(item, [], deps);
  await vi.advanceTimersByTimeAsync(0);
  await vi.advanceTimersByTimeAsync(2_000);
  await expect(result).resolves.toEqual({ status: "connected", row: row("connected") });
  expect(deps.closeBrowser).toHaveBeenCalled();
  expect(deps.revoke).not.toHaveBeenCalled();
});

it("cancels and removes the unfinished account when the page is closed first", async () => {
  const { deps, page } = setup([]);
  const result = connectInApp(item, [], deps);
  await vi.advanceTimersByTimeAsync(0);
  page.resolve({ type: "cancel" });
  await vi.advanceTimersByTimeAsync(10_000);
  await expect(result).resolves.toEqual({ status: "cancelled" });
  expect(deps.revoke).toHaveBeenCalledWith("connection-a");
});

it("keeps an account that finished just as the page was closed", async () => {
  const { deps, page } = setup(["pending"]);
  const result = connectInApp(item, [], deps);
  await vi.advanceTimersByTimeAsync(0);
  deps.complete.mockResolvedValue(row("connected"));
  page.resolve({ type: "cancel" });
  await vi.advanceTimersByTimeAsync(10_000);
  await expect(result).resolves.toEqual({ status: "connected", row: row("connected") });
  expect(deps.revoke).not.toHaveBeenCalled();
});
