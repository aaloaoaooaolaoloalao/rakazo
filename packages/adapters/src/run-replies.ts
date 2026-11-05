import type { MessageBlock } from "@rakazo/contracts";
import { isBackgroundRunTrigger } from "@rakazo/core";
import { NO_RESPONSE } from "./silent-reply.js";
import {
  SPARK_CONCISE_REPLY_GUIDANCE,
  sparkConciseReplyGuidanceForTrigger,
} from "./spark-reply-style.js";
import { messageUserMaxLength } from "./user-progress.js";

export { SPARK_CONCISE_REPLY_GUIDANCE } from "./spark-reply-style.js";

export function longWorkProgressGuidance(maxLength = messageUserMaxLength()): string {
  return `When the task needs more than a quick one-line answer — multi-step work, research, or computer use — keep the user informed in chat. Post a short line with message_user when you begin (one sentence). On long work, add at most a few brief milestone updates (one or two sentences each), not one per tool call. Thinking stays private. message_user is capped at ${maxLength} characters and will be silently cut off if you exceed it — never put your final answer, a report, or long deliverables there. Always put the complete final answer in your normal reply only; never split the answer across message_user calls.`;
}

export const ROUTINE_SILENT_REPLY_GUIDANCE = `If this routine's prompt says to stay silent when there is nothing to report, the entire final assistant reply must be exactly ${NO_RESPONSE} — no surrounding prose, no variants, no progress updates, no all-clear, and no meta note that you are staying silent. Do not call message_user unless you have something to report.`;

export const REACTION_SILENT_REPLY_GUIDANCE = `The user reacted with an emoji to your message. Reply only if the reaction calls for it, such as a correction after 👎, a go-ahead on something you proposed, or a question. Otherwise the entire final assistant reply must be exactly ${NO_RESPONSE}, with no message_user call.`;

export const GROUP_UNADDRESSED_REPLY_GUIDANCE = `This message went to every member of the group and names nobody. Members decide at about the same time, so do not count on seeing the others' replies. Before using any tools, decide whether it is for you. Answer when it falls within your own description, or when it asks each member to reply. Stay silent when it fits another member's description better, or when no member's description fits it and you are not the first member listed. To stay silent, the entire final assistant reply must be exactly ${NO_RESPONSE}, with no tool calls, never a dot, a placeholder or an empty message.`;

export function runAllowsSilentEmpty(trigger: string): boolean {
  return trigger === "reaction" || trigger === "routine" || isBackgroundRunTrigger(trigger);
}

/**
 * Whether text written before a tool call may become a durable mid-turn chat bubble.
 * Routine and bot-to-bot runs hold it back, using the last segment as the final reply
 * only when the model supplies none and has not explicitly chosen silence.
 * Background runs never promote it.
 */
export function runPromotesMidTurnNarration(trigger: string): boolean {
  return trigger !== "routine" && trigger !== "bot_message" && !isBackgroundRunTrigger(trigger);
}

export const TICKET_SILENT_REPLY_GUIDANCE =
  "Ticket work is reported on the board, not in chat. Put updates and results in ticket_comment and keep the ticket status current with ticket_update. Use the existing ask or approval mechanism when user input is needed. Leave the final reply empty.";

export function progressReplyGuidance(trigger: string): string {
  if (trigger === "reaction") return REACTION_SILENT_REPLY_GUIDANCE;
  if (isBackgroundRunTrigger(trigger)) return TICKET_SILENT_REPLY_GUIDANCE;
  return runAllowsSilentEmpty(trigger) ? ROUTINE_SILENT_REPLY_GUIDANCE : longWorkProgressGuidance();
}

export function runReplyGuidance(trigger: string): string {
  const progress = progressReplyGuidance(trigger);
  const concise = sparkConciseReplyGuidanceForTrigger(trigger);
  return concise ? `${concise} ${progress}` : progress;
}

export function replyGuidanceForOfferedTools(
  guidance: string,
  disabled?: ReadonlySet<string>,
): string | undefined {
  if (!disabled?.has("message_user")) return guidance;
  const progress = longWorkProgressGuidance();
  if (guidance === progress || guidance.endsWith(` ${progress}`)) {
    const prefix = guidance.slice(0, guidance.length - progress.length).trim();
    const shortProgress = "Always put the complete final answer in your normal reply.";
    return prefix ? `${prefix} ${shortProgress}` : shortProgress;
  }
  if (guidance === REACTION_SILENT_REPLY_GUIDANCE) {
    return guidance.replace(", with no message_user call.", ".");
  }
  if (guidance === ROUTINE_SILENT_REPLY_GUIDANCE) {
    return guidance.replace(" Do not call message_user unless you have something to report.", "");
  }
  return guidance.includes("message_user") ? undefined : guidance;
}

export const DELEGATED_EMPTY_NOTICE =
  "The delegated bot completed its turn without a written summary.";

/** Failure used when a tool-bearing turn would otherwise complete as the empty notice. */
export const TOOL_STEPS_WITHOUT_RESPONSE =
  "The model finished its tool steps without a written response.";

/** True when the only written completion is the empty delegated notice after tool steps. */
export function emptyDelegatedToolTurnShouldFail(blocks: MessageBlock[]): boolean {
  const text = blocks
    .filter((block): block is Extract<MessageBlock, { kind: "text" }> => block.kind === "text")
    .map((block) => block.text)
    .join("")
    .trim();
  return text === DELEGATED_EMPTY_NOTICE && blocks.some((block) => block.kind === "steps");
}

export function completionMessageSegments(
  segments: MessageBlock[],
  options?: {
    allowSilentEmpty?: boolean;
    emptyResponseText?: string;
    suppressOutput?: boolean;
    skipEmptyFallback?: boolean;
  },
): MessageBlock[] {
  if (options?.suppressOutput) return [];
  const fallback = options?.emptyResponseText?.trim() || "done.";
  if (segments.length > 0) {
    if (
      !options?.allowSilentEmpty &&
      options?.emptyResponseText !== undefined &&
      !segments.some((segment) => segment.kind === "text" && segment.text)
    ) {
      return [...segments, { kind: "text", text: fallback }];
    }
    return segments;
  }
  if (options?.allowSilentEmpty || options?.skipEmptyFallback) return [];
  return [{ kind: "text", text: fallback }];
}
