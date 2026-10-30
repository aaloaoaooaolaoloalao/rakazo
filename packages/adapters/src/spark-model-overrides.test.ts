import { builtinModels } from "@earendil-works/pi-ai/providers/all";
import { describe, expect, it } from "vitest";
import { listPiCatalog } from "./pi-models.js";
import { resolveRuntimeModel } from "./pi-runtime-models.js";
import {
  mistralReasoningEffort,
  registerSparkModelOverrides,
  SPARK_GLM_FLASH_ID,
} from "./spark-model-overrides.js";

describe("spark model overrides", () => {
  it("resolves GLM 5.3 Flash and lists it in the catalog", () => {
    const resolved = resolveRuntimeModel({ provider: "mistral", id: SPARK_GLM_FLASH_ID });
    expect(resolved.model?.id).toBe(SPARK_GLM_FLASH_ID);
    expect(resolved.model?.name).toBe("GLM 5.3 Flash");
    expect(resolved.model?.api).toBe("mistral-conversations");
    expect(resolved.model?.baseUrl).toBe("https://api.mistral.ai");
    expect(resolved.model?.contextWindow).toBe(1_048_576);
    expect(resolved.model?.maxTokens).toBe(131_072);
    expect(resolved.model?.cost).toMatchObject({ input: 0.15, output: 0.5, cacheRead: 0.03 });
    expect(listPiCatalog().some((entry) => entry.id === SPARK_GLM_FLASH_ID)).toBe(true);
  });

  it("sends high instead of none when a thinking level maps to null", () => {
    const models = registerSparkModelOverrides(builtinModels());
    const flash = models.getModel("mistral", SPARK_GLM_FLASH_ID)!;
    expect(flash.thinkingLevelMap?.medium).toBeNull();
    expect(mistralReasoningEffort(flash, "medium")).toBe("high");
    expect(mistralReasoningEffort(flash, null)).toBe("high");
  });

  it("leaves existing Mistral thinking maps alone", () => {
    const models = registerSparkModelOverrides(builtinModels());
    const current = models.getModel("mistral", "zai-glm-5-3")!;
    const previous = models.getModel("mistral", "zai-glm-5-2")!;
    expect(current.thinkingLevelMap?.off).toBeNull();
    expect(current.thinkingLevelMap?.low).toBe("low");
    expect(mistralReasoningEffort(current, "off")).toBeUndefined();
    expect(previous.thinkingLevelMap?.off).toBe("none");
    expect(mistralReasoningEffort(previous, "off")).toBe("none");
  });
});
