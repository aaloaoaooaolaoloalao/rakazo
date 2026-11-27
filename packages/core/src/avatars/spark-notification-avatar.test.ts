import { describe, expect, it } from "vitest";
import { notificationAvatarSource } from "./notification-avatar.js";
import { layoutSparkDots, poseAt, sparkShape } from "./spark-dot-geometry.js";
import { sparkNotificationAvatarSource } from "./spark-notification-avatar.js";

function decodedSvg(source: string): string {
  expect(source.startsWith("data:image/svg+xml,")).toBe(true);
  return decodeURIComponent(source.slice(source.indexOf(",") + 1));
}

describe("sparkNotificationAvatarSource", () => {
  it("renders idle Spark dots for a stored shape and color", () => {
    const bot = { id: "bot-hex", color: "#1084FE::shape_5" };
    const shape = sparkShape(5, bot.id);
    expect(shape).toBe("hex");
    const source = sparkNotificationAvatarSource(bot);
    const svg = decodedSvg(source);
    expect(svg).toContain("<circle");
    expect(svg).not.toContain("<path");
    const pose = poseAt("idle", 0, true);
    const expected = layoutSparkDots(shape, 96, "#1084FE", pose);
    expect(svg.match(/<circle/g)?.length).toBe(expected.length);
    expect(svg).toContain(`fill="${expected[0]!.color}"`);
  });

  it("returns a saved photo unchanged", () => {
    const color = "data:image/png;base64,aGVsbG8=";
    expect(sparkNotificationAvatarSource({ id: "bot", color })).toBe(color);
  });

  it("differs from the Rakazo silhouette portrait for the same bot", () => {
    const bot = { id: "agent-1", color: "#8B5CF6::shape_3" };
    const rakazo = decodedSvg(notificationAvatarSource(bot));
    const spark = decodedSvg(sparkNotificationAvatarSource(bot));
    expect(rakazo).toContain("<path");
    expect(spark).toContain("<circle");
    expect(spark).not.toEqual(rakazo);
  });
});