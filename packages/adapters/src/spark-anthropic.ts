import type { AgentUsage } from "@rakazo/adapter-kit";
import { resolveDeploymentModel } from "./models/deployment-model.js";
import { SPARK_GLM_FLASH_ID } from "./spark-model-overrides.js";

/** Direct Anthropic API (not OpenRouter). */
export const SPARK_ANTHROPIC_PROVIDER = "anthropic";

/** Matches `modelProviders.anthropic.deployment.keyEnv` upstream. */
export const SPARK_ANTHROPIC_KEY_ENV = "ANTHROPIC_API_KEY";

/** Suggested default when switching agents from GLM; override with `DEFAULT_MODEL_ID`. */
export const SPARK_ANTHROPIC_DEFAULT_MODEL_ID = "claude-sonnet-5-5";

export function sparkAnthropicApiKeyPresent(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env[SPARK_ANTHROPIC_KEY_ENV]?.trim());
}

/** True when deployment env selects Anthropic and the direct API key is set. */
export function sparkAnthropicDeploymentActive(env: NodeJS.ProcessEnv = process.env): boolean {
  const deployment = resolveDeploymentModel(env);
  return (
    deployment.provider === SPARK_ANTHROPIC_PROVIDER &&
    deployment.configured &&
    sparkAnthropicApiKeyPresent(env)
  );
}

/**
 * Tokens that count toward `USER_TOKEN_LIMIT_*`, aligned with `usage_records` aggregation:
 * uncached input plus output. Cache read/write are stored separately and must not be
 * added again — `pi-usage` already nets cache buckets out of `inputTokens`.
 */
export function sparkPerRunLimitTokens(
  usage: Pick<
    AgentUsage,
    "inputTokens" | "outputTokens" | "cacheReadTokens" | "cacheWriteTokens"
  >,
): number {
  return Math.max(0, usage.inputTokens ?? 0) + Math.max(0, usage.outputTokens ?? 0);
}

/** Env to restore current Spark production defaults (GLM via Mistral). */
export const SPARK_GLM_DEPLOYMENT_ENV = {
  DEFAULT_MODEL_PROVIDER: "mistral",
  DEFAULT_MODEL_ID: SPARK_GLM_FLASH_ID,
} as const;

/** Example env after adding `ANTHROPIC_API_KEY` on the server (no secret in repo). */
export const SPARK_ANTHROPIC_DEPLOYMENT_ENV = {
  DEFAULT_MODEL_PROVIDER: SPARK_ANTHROPIC_PROVIDER,
  DEFAULT_MODEL_ID: SPARK_ANTHROPIC_DEFAULT_MODEL_ID,
  [SPARK_ANTHROPIC_KEY_ENV]: "<set in docker-compose override, not in git>",
} as const;