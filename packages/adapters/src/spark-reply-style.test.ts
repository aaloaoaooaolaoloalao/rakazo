import { describe, expect, it } from "vitest";
import { longWorkProgressGuidance, progressReplyGuidance, runReplyGuidance } from "./run-replies.js";
import {
  SPARK_CONCISE_REPLY_GUIDANCE,
  sparkConciseReplyGuidanceForTrigger,
  sparkDefaultBotSystemPrompt,
} from "./spark-reply-style.js";

describe("spark reply style", () => {
  it("includes concise guidance in default bot fallback prompts", () => {
    expect(sparkDefaultBotSystemPrompt(true)).toContain(SPARK_CONCISE_REPLY_GUIDANCE);
    expect(sparkDefaultBotSystemPrompt(false)).toContain("sandbox filesystem");
  });

  it("prepends concise guidance for ordinary chat triggers", () => {
    expect(sparkConciseReplyGuidanceForTrigger("user")).toBe(SPARK_CONCISE_REPLY_GUIDANCE);
    expect(sparkConciseReplyGuidanceForTrigger("reaction")).toBeUndefined();
    expect(runReplyGuidance("user")).toBe(
      `${SPARK_CONCISE_REPLY_GUIDANCE} ${longWorkProgressGuidance()}`,
    );
    expect(runReplyGuidance("user")).toContain("plain, simple language");
  });

  it("keeps silent triggers free of concise chat guidance", () => {
    expect(runReplyGuidance("reaction")).toBe(progressReplyGuidance("reaction"));
    expect(runReplyGuidance("reaction")).not.toContain("plain, simple language");
  });
});
