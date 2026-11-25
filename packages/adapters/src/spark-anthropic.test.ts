import type { Api, Model } from "@earendil-works/pi-ai";
import { anthropicMessagesApi } from "@earendil-works/pi-ai/api/anthropic-messages.lazy";
import { normalizeContext } from "@earendil-works/pi-ai/utils/transcript";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AgentRuntimeEvent } from "@rakazo/adapter-kit";
import { resolveDeploymentModel } from "./models/deployment-model.js";
import { observedPiStream } from "./runtime/pi/usage/pi-usage.js";
import {
  SPARK_ANTHROPIC_DEFAULT_MODEL_ID,
  SPARK_ANTHROPIC_KEY_ENV,
  SPARK_ANTHROPIC_PROVIDER,
  SPARK_GLM_DEPLOYMENT_ENV,
  sparkAnthropicDeploymentActive,
  sparkPerRunLimitTokens,
} from "./spark-anthropic.js";
import { SPARK_GLM_FLASH_ID } from "./spark-model-overrides.js";

const hebrewSystem =
  "אתה עוזר SparkAI. ענה בעברית קצרה אלא אם התבקשת אחרת.";

const shellTool = {
  name: "shell",
  description: "Run a shell command.",
  parameters: {
    type: "object",
    properties: { command: { type: "string" } },
    required: ["command"],
  },
} as const;

describe("spark anthropic deployment env", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("keeps Mistral GLM as the default when no Anthropic key is set", () => {
    expect(
      resolveDeploymentModel({
        DEFAULT_MODEL_PROVIDER: "mistral",
        DEFAULT_MODEL_ID: SPARK_GLM_FLASH_ID,
        MISTRAL_API_KEY: "mistral-fixture",
        OPENROUTER_API_KEY: "or-fixture",
      }),
    ).toMatchObject({
      provider: "mistral",
      model: SPARK_GLM_FLASH_ID,
      configured: true,
    });
    expect(
      resolveDeploymentModel({
        DEFAULT_MODEL_PROVIDER: "anthropic",
        MISTRAL_API_KEY: "mistral-fixture",
      }).configured,
    ).toBe(false);
  });

  it("pairs Anthropic with ANTHROPIC_API_KEY when DEFAULT_MODEL_* select it", () => {
    vi.stubEnv("DEFAULT_MODEL_PROVIDER", SPARK_ANTHROPIC_PROVIDER);
    vi.stubEnv("DEFAULT_MODEL_ID", SPARK_ANTHROPIC_DEFAULT_MODEL_ID);
    vi.stubEnv(SPARK_ANTHROPIC_KEY_ENV, "anthropic-fixture-key");
    vi.stubEnv("MISTRAL_API_KEY", "mistral-fixture");
    expect(resolveDeploymentModel()).toEqual({
      provider: SPARK_ANTHROPIC_PROVIDER,
      model: SPARK_ANTHROPIC_DEFAULT_MODEL_ID,
      key: "anthropic-fixture-key",
      configured: true,
      hostCredentials: false,
    });
    expect(sparkAnthropicDeploymentActive()).toBe(true);
  });

  it("documents rollback env back to GLM", () => {
    expect(SPARK_GLM_DEPLOYMENT_ENV).toEqual({
      DEFAULT_MODEL_PROVIDER: "mistral",
      DEFAULT_MODEL_ID: SPARK_GLM_FLASH_ID,
    });
  });
});

describe("spark anthropic direct API wire", () => {
  it("sends tool definitions, cache_control, and records cache read tokens", async () => {
    const model = {
      id: SPARK_ANTHROPIC_DEFAULT_MODEL_ID,
      name: "Claude Sonnet 5.5",
      api: "anthropic-messages",
      provider: SPARK_ANTHROPIC_PROVIDER,
      baseUrl: "https://api.anthropic.com",
      reasoning: false,
      input: ["text"],
      cost: { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },
      contextWindow: 200_000,
      maxTokens: 8192,
    } satisfies Model<Api>;
    let payload: Record<string, unknown> = {};
    const events: AgentRuntimeEvent[] = [];
    const stream = await observedPiStream(
      { streamSimple: anthropicMessagesApi().streamSimple } as unknown as Parameters<
        typeof observedPiStream
      >[0],
      model,
      normalizeContext({
        systemPrompt: hebrewSystem,
        messages: [{ role: "user", content: "בדוק את המחשב.", timestamp: 0 }],
        tools: [shellTool],
      }),
      {
        apiKey: "anthropic-fixture-key",
        fetch: async (_input, init) => {
          payload = JSON.parse(String(init?.body));
          const frames = [
            {
              type: "message_start",
              message: {
                id: "msg_fixture",
                type: "message",
                role: "assistant",
                model: SPARK_ANTHROPIC_DEFAULT_MODEL_ID,
                content: [],
                stop_reason: null,
                usage: {
                  input_tokens: 800,
                  output_tokens: 0,
                  cache_read_input_tokens: 11_000,
                  cache_creation_input_tokens: 400,
                },
              },
            },
            {
              type: "message_delta",
              delta: { stop_reason: "end_turn" },
              usage: { output_tokens: 42 },
            },
            { type: "message_stop" },
          ];
          return new Response(
            frames
              .map((event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`)
              .join(""),
            { headers: { "content-type": "text/event-stream" } },
          );
        },
      },
      (event) => events.push(event),
    );
    for await (const _event of stream) {
    }
    expect((await stream.result()).stopReason).not.toBe("error");

    expect(JSON.stringify(payload.messages)).toContain('"cache_control"');
    expect(JSON.stringify(payload.messages)).toContain('"type":"ephemeral"');
    expect(JSON.stringify(payload.tools)).toContain("shell");
    expect(JSON.stringify(payload.system)).toContain(hebrewSystem);
    expect(JSON.stringify(payload.messages)).toContain("בדוק את המחשב");

    const usage = events.find((event) => event.type === "usage");
    expect(usage).toMatchObject({
      inputTokens: 800,
      outputTokens: 42,
      cacheReadTokens: 11_000,
      cacheWriteTokens: 400,
    });
    expect(sparkPerRunLimitTokens(usage!)).toBe(842);
    expect(sparkPerRunLimitTokens(usage!)).toBeLessThan(
      (usage!.inputTokens ?? 0) +
        (usage!.outputTokens ?? 0) +
        (usage!.cacheReadTokens ?? 0) +
        (usage!.cacheWriteTokens ?? 0),
    );
  });
});