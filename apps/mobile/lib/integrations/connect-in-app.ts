import type { Connection, ConnectionCatalogItem } from "@rakazo/contracts";
import { nextCatalogAccountLabel, waitForConnection } from "@rakazo/core";

/** Reads while the sign-in page is open: about ten minutes, as long as someone may take there. */
const OPEN_READS = 300;
/** Reads after the page closes, so a sign-in that just finished is not called cancelled. */
const CLOSED_READS = 3;

export type InAppConnectResult =
  | { status: "connected"; row?: Connection }
  | { status: "pending" }
  | { status: "cancelled" }
  | { status: "aborted" };

/**
 * Connects one catalog app with its sign-in page in the in-app browser. The page closes by
 * itself once the account is connected; closing it first cancels the attempt and removes the
 * unfinished account, so trying again starts clean.
 */
export async function connectInApp(
  item: ConnectionCatalogItem,
  connections: readonly Connection[],
  deps: {
    begin: (input: {
      connectorId: string;
      provider: string;
      displayName: string;
    }) => Promise<{ connectionId: string; authorizationUrl: string | null }>;
    complete: (input: { connectionId: string }) => Promise<Connection>;
    revoke: (connectionId: string) => Promise<unknown>;
    /** Resolves when the page closes, whether the person closed it or `closeBrowser` did. */
    openBrowser: (url: string) => Promise<unknown>;
    closeBrowser: () => void;
    signal: AbortSignal;
    isCurrent?: () => boolean;
  },
): Promise<InAppConnectResult> {
  const stopped = () => deps.signal.aborted || deps.isCurrent?.() === false;
  const started = await deps.begin({
    connectorId: item.connectorId,
    provider: item.slug,
    displayName: nextCatalogAccountLabel(connections, item),
  });
  if (stopped()) return { status: "aborted" };
  if (!started.authorizationUrl) {
    if (item.noAuth) return { status: "connected" };
    return waitForConnection(started.connectionId, deps.complete, {
      signal: deps.signal,
      isCurrent: deps.isCurrent,
      attempts: OPEN_READS,
    });
  }

  const reading = new AbortController();
  const stopReading = () => reading.abort();
  deps.signal.addEventListener("abort", stopReading, { once: true });
  try {
    const pageClosed = deps.openBrowser(started.authorizationUrl).then(() => "closed" as const);
    const read = waitForConnection(started.connectionId, deps.complete, {
      signal: reading.signal,
      isCurrent: deps.isCurrent,
      attempts: OPEN_READS,
    });
    const first = await Promise.race([pageClosed, read]);
    if (first !== "closed") {
      deps.closeBrowser();
      if (first.status === "connected") return first;
      return stopped() ? { status: "aborted" } : { status: "pending" };
    }
    reading.abort();
    if (stopped()) return { status: "aborted" };
    const last = await waitForConnection(started.connectionId, deps.complete, {
      signal: deps.signal,
      isCurrent: deps.isCurrent,
      attempts: CLOSED_READS,
    });
    if (last.status !== "pending") return last;
    await deps.revoke(started.connectionId);
    return { status: "cancelled" };
  } finally {
    deps.signal.removeEventListener("abort", stopReading);
    if (deps.signal.aborted) deps.closeBrowser();
  }
}
