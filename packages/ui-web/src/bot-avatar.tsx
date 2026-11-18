import type { BotAvatarSet, BotColorDef } from "@rakazo/contracts";
import { BOT_COLOR_LIST, BOT_COLORS } from "@rakazo/contracts";
import type { LogoAvatarActivity } from "@rakazo/core";
import {
  WORKING_RUN_STATUSES,
  DEFAULT_BOT_AVATAR_COLOR,
  resolvePersonaColorDef,
  SHIPPED_BOT_AVATAR_SHAPE_KEYS,
  SHIPPED_BOT_AVATAR_SHAPES,
} from "@rakazo/core";
import { memo, useMemo } from "react";
import { useBotAvatarActivity } from "./bot-avatar-activity.js";
import { cn } from "./lib/utils.js";
import { SparkDotAvatar, sparkMood, sparkShape } from "./spark-dot-avatar.js";
import "./styles.css";

export type { BotColorDef };
export { BOT_COLOR_LIST, BOT_COLORS, DEFAULT_BOT_AVATAR_COLOR, resolvePersonaColorDef };

export const BOT_SHAPES = SHIPPED_BOT_AVATAR_SHAPES;
export const SHIPPED_SHAPE_KEYS = SHIPPED_BOT_AVATAR_SHAPE_KEYS;

export const BOT_MASCOT_SHAPES = SHIPPED_SHAPE_KEYS.map(
  (k) => BOT_SHAPES[k] ?? FALLBACK_SHAPE_PATH,
);

const FALLBACK_SHAPE_PATH = BOT_SHAPES.hex ?? "";

export function parseBotAvatar(
  rawColor: string,
  _identity?: string,
): {
  color: string;
  shapeIndex?: number;
  isImage: boolean;
  imageUrl?: string;
} {
  if (!rawColor) return { color: "#F97316", isImage: false };
  // Only data: image URLs are rendered. Arbitrary http(s)/blob values in `color`
  // must not become <img src> (SSRF / tracking when other members view the bot).
  if (rawColor.startsWith("data:image/")) {
    return { color: "#F97316", isImage: true, imageUrl: rawColor };
  }
  if (rawColor.includes("::shape_")) {
    const parts = rawColor.split("::shape_");
    const rawShapeIdx = parts[1] ?? "0";
    const parsedShapeIdx = /^\d+$/.test(rawShapeIdx) ? Number(rawShapeIdx) : 0;
    const shapeIdx = Number.isSafeInteger(parsedShapeIdx) ? parsedShapeIdx : 0;
    return {
      color: parts[0] || "#F97316",
      shapeIndex: shapeIdx % SHIPPED_SHAPE_KEYS.length,
      isImage: false,
    };
  }
  return { color: rawColor, isImage: false };
}

const AVATAR_HEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

export function defaultBotAvatarValue(rawColor: string): string {
  const parsed = parseBotAvatar(rawColor);
  if (rawColor && !parsed.isImage && AVATAR_HEX.test(parsed.color)) return parsed.color;
  return DEFAULT_BOT_AVATAR_COLOR;
}

export interface BotAvatarProps {
  color: string;
  avatarSet?: BotAvatarSet;
  activity?: LogoAvatarActivity;
  size?: number;
  status?: string;
  identity?: string;
  className?: string;
  /** The create and edit hero: dots travel between shapes and look around. */
  morph?: boolean;
}

export const BotAvatar = memo(function BotAvatar({
  color,
  avatarSet: _avatarSet,
  activity,
  size = 36,
  status,
  identity = "",
  className,
  morph = false,
}: BotAvatarProps) {
  const isWorking = WORKING_RUN_STATUSES.some((s) => s === status);

  const parsed = useMemo(() => parseBotAvatar(color, identity), [color, identity]);
  const effectiveId = identity || parsed.color || "agent";

  const colorDef = useMemo(
    () => resolvePersonaColorDef(effectiveId, parsed.color),
    [effectiveId, parsed.color],
  );

  if (parsed.isImage && parsed.imageUrl) {
    return (
      <div
        className={cn("rakazo-bot-avatar relative shrink-0 select-none", className)}
        data-working={isWorking}
        style={{ width: size, height: size }}
      >
        <div className="rakazo-bot-avatar-picture relative flex h-full w-full items-center justify-center overflow-hidden rounded-full border border-border bg-secondary">
          <img src={parsed.imageUrl} alt="" className="h-full w-full object-cover" />
        </div>
        {isWorking ? (
          <svg
            className="rakazo-bot-avatar-ring rakazo-bot-avatar-ring-working absolute pointer-events-none"
            style={{
              inset: -4,
              width: size + 8,
              height: size + 8,
            }}
            viewBox="0 0 48 48"
            fill="none"
            aria-hidden="true"
          >
            <circle
              cx="24"
              cy="24"
              r="22"
              className="stroke-status-working"
              strokeWidth="3.2"
              strokeLinecap="round"
              strokeDasharray="45 80"
            />
          </svg>
        ) : null}
      </div>
    );
  }

  const live = useBotAvatarActivity(effectiveId, status);
  return (
    <SparkDotAvatar
      shape={sparkShape(parsed.shapeIndex, effectiveId)}
      color={colorDef.hex}
      size={size}
      mood={sparkMood(activity ?? live, isWorking)}
      seed={effectiveId}
      morph={morph}
      className={className}
    />
  );
});

export function BotShapePreview({
  shapeIndex,
  identity,
  label,
  color,
  selected,
  onClick,
}: {
  /** An Avatar Studio shape; omit it to draw the organic body `identity` gets. */
  shapeIndex?: number;
  identity?: string;
  label?: string;
  color: string;
  selected?: boolean;
  onClick?: () => void;
}) {
  const key =
    shapeIndex === undefined
      ? undefined
      : (SHIPPED_SHAPE_KEYS[shapeIndex % SHIPPED_SHAPE_KEYS.length] ?? "hex");
  const colorDef = resolvePersonaColorDef("preview", color);

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label ?? key}
      aria-pressed={selected ?? false}
      className={cn(
        "relative flex size-11 items-center justify-center rounded-xl transition-transform hover:scale-105 active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-popover",
        selected
          ? "ring-2 ring-primary ring-offset-2 ring-offset-popover bg-white/10"
          : "hover:bg-white/5",
      )}
    >
      <SparkDotAvatar
        shape={sparkShape(shapeIndex, identity || color)}
        color={colorDef.hex}
        size={32}
        mood="idle"
      />
    </button>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <img src="/apple-touch-icon.png" alt="" className="h-11 w-11 rounded-[12px]" />
      <span className="font-[Aeonik,ui-sans-serif] text-[28px] tracking-tight text-foreground">
        SparkAI
      </span>
    </div>
  );
}
