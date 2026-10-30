import type { Model, MutableModels, ThinkingLevelMap } from "@earendil-works/pi-ai";

/** Mistral hosts this id, but pi-ai 1.3.0's catalog only has `zai-glm-5-3`. */
export const SPARK_GLM_FLASH_ID = "zai-glm-5-3-flash";

/** Same levels as `zai-glm-5-3`. Null means the provider has no matching effort. */
const GLM_53_THINKING_LEVELS: ThinkingLevelMap = {
  off: null,
  minimal: null,
  low: "low",
  medium: null,
  high: "high",
  xhigh: null,
  max: "max",
};

export function sparkGlmFlashModel(): Model<"mistral-conversations"> {
  return {
    id: SPARK_GLM_FLASH_ID,
    name: "GLM 5.3 Flash",
    api: "mistral-conversations",
    provider: "mistral",
    baseUrl: "https://api.mistral.ai",
    reasoning: true,
    thinkingLevelMap: { ...GLM_53_THINKING_LEVELS },
    input: ["text"],
    cost: { input: 0.15, output: 0.5, cacheRead: 0.03, cacheWrite: 0 },
    contextWindow: 1_048_576,
    maxTokens: 131_072,
  };
}

/** Append Spark-only models the bundled catalog does not know yet. */
export function registerSparkModelOverrides(models: MutableModels): MutableModels {
  const provider = models.getProvider?.("mistral");
  if (!provider) return models;
  const existing = provider.getModels();
  if (existing.some((model) => model.id === SPARK_GLM_FLASH_ID)) return models;
  const extra = sparkGlmFlashModel();
  models.setProvider({
    ...provider,
    getModels: () => [...existing, extra],
  });
  return models;
}

/**
 * Effort string Mistral should receive. GLM 5.3 Flash rejects `reasoning_effort: "none"`,
 * so a level that maps to null is sent as `"high"` instead. Other Mistral models keep
 * their catalog mapping, including an explicit `"none"`.
 */
export function mistralReasoningEffort(
  model: Pick<Model<"mistral-conversations">, "id" | "thinkingLevelMap">,
  level: keyof ThinkingLevelMap | null,
): string | undefined {
  const mapped = model.thinkingLevelMap?.[level ?? "off"];
  if (model.id === SPARK_GLM_FLASH_ID && (mapped == null || mapped === "none")) return "high";
  return mapped ?? undefined;
}
