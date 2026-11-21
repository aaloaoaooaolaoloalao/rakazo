import type {
  AdapterContext,
  AgentToolExecutionResult,
  WebFetchProvider,
  WebSearchProvider,
} from "@rakazo/adapter-kit";
import { fenceUntrustedWebContent } from "@rakazo/core";
import { clampMaxChars, clampMaxResults, clampOffset } from "./web-limits.js";

/** Payload behind a fenced web tool result (for tests and connectors). */
export function webToolDetails<T>(result: unknown): T {
  if (
    result &&
    typeof result === "object" &&
    (result as AgentToolExecutionResult).kind === "agent_tool_result"
  ) {
    return (result as AgentToolExecutionResult).details as T;
  }
  return result as T;
}

function fencedWebResult(source: string, payload: unknown): AgentToolExecutionResult {
  const text = fenceUntrustedWebContent(source, JSON.stringify(payload, null, 2));
  return {
    kind: "agent_tool_result",
    content: [{ type: "text", text }],
    details: payload,
  };
}

export async function webSearchFromTool(
  search: WebSearchProvider,
  context: AdapterContext,
  args: Record<string, unknown>,
) {
  const query = String(args.query ?? "").trim();
  if (!query) return { error: "query is required" };
  try {
    const results = await search.search(
      {
        query,
        maxResults: clampMaxResults(args.maxResults),
        signal: context.signal,
      },
      context,
    );
    return fencedWebResult("web_search", { results });
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

export async function webFetchFromTool(
  fetchProvider: WebFetchProvider,
  context: AdapterContext,
  args: Record<string, unknown>,
) {
  const url = String(args.url ?? "").trim();
  if (!url) return { error: "url is required" };
  try {
    const result = await fetchProvider.fetch(
      {
        url,
        maxChars: clampMaxChars(args.maxChars),
        offset: clampOffset(args.offset),
        signal: context.signal,
      },
      context,
    );
    return fencedWebResult("web_fetch", result);
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}