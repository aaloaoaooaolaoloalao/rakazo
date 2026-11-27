import { BotAvatarValueSchema, parseBotAvatarValue } from "@rakazo/contracts";
import { layoutSparkDots, poseAt, sparkShape } from "./spark-dot-geometry.js";
import { resolvePersonaColorDef } from "./bot-avatar-colors.js";

const NOTIFICATION_SIZE = 96;

/** Static Spark halftone portrait for push, matching in-app idle Spark dots. */
export function sparkNotificationAvatarSource(bot: {
  id: string;
  color: string;
  avatarSet?: string | null;
}): string {
  const parsed = BotAvatarValueSchema.safeParse(bot.color).success
    ? parseBotAvatarValue(bot.color)
    : null;
  if (parsed?.kind === "image") return parsed.imageUrl;
  const color = resolvePersonaColorDef(
    bot.id,
    parsed && "color" in parsed ? parsed.color : bot.color,
  ).hex;
  const shape = sparkShape(
    parsed?.kind === "shape" ? parsed.shapeIndex : undefined,
    bot.id,
  );
  const pose = poseAt("idle", 0, true);
  const dots = layoutSparkDots(shape, NOTIFICATION_SIZE, color, pose);
  const body = dots
    .map(
      (dot) =>
        `<circle cx="${dot.x.toFixed(3)}" cy="${dot.y.toFixed(3)}" r="${(dot.d / 2).toFixed(3)}" fill="${dot.color}"/>`,
    )
    .join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${NOTIFICATION_SIZE}" height="${NOTIFICATION_SIZE}" viewBox="0 0 ${NOTIFICATION_SIZE} ${NOTIFICATION_SIZE}">${body}</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}