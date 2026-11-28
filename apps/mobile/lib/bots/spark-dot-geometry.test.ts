import { describe, expect, it } from "vitest";
import {
  layoutSparkDots,
  layoutSparkSlots,
  poseAt,
  SPARK_GAZE_CENTER,
  SPARK_SHAPES,
  sparkMood,
  sparkShape,
} from "./spark-dot-geometry";

function brightness(color: string): number {
  const [r, g, b, a] = color.slice(5, -1).split(",").map(Number) as [
    number,
    number,
    number,
    number,
  ];
  return ((r + g + b) / 3) * a + 20 * (1 - a);
}

describe("spark dot geometry", () => {
  it("stores shapes in the same order as web", () => {
    expect(SPARK_SHAPES[0]).toBe("blob");
    expect(sparkShape(0, "ignored")).toBe("blob");
    expect(sparkShape(13, "ignored")).toBe("pill");
    expect(sparkShape(undefined, "agent")).toBe(sparkShape(undefined, "agent"));
  });

  it("maps activity the way the web avatar does", () => {
    expect(sparkMood("waiting", false)).toBe("needsInput");
    expect(sparkMood("writing", false)).toBe("working");
    expect(sparkMood("idle", true)).toBe("working");
    expect(sparkMood("error", false)).toBe("idle");
    expect(sparkMood(undefined, false)).toBe("idle");
  });

  it("draws a halftone body with eye holes and leaves the corners empty", () => {
    const dots = layoutSparkDots("ghost", 36, "#1084FE", poseAt("idle", 1, true));
    expect(dots.length).toBeGreaterThan(20);
    expect(dots.length).toBeLessThan(13 * 13);
    expect(dots.every((dot) => dot.color.startsWith("rgba("))).toBe(true);
    const corner = dots.some((dot) => dot.x < 4 && dot.y < 4);
    expect(corner).toBe(false);
    const eye = dots.some((dot) => dot.key === "4:4" || dot.key === "5:4" || dot.key === "6:8");
    expect(eye).toBe(false);
  });

  it("gives every shape a body", () => {
    for (const shape of SPARK_SHAPES) {
      expect(layoutSparkDots(shape, 36, "#3B82F6", poseAt("idle", 1, true)).length).toBeGreaterThan(
        8,
      );
    }
  });

  it("lifts the dim dots toward white on a dark page", () => {
    const pose = poseAt("idle", 1, true);
    const light = layoutSparkDots("pebble", 96, "#7C5CFF", pose, "light");
    const dark = layoutSparkDots("pebble", 96, "#7C5CFF", pose, "dark");
    const dimmest = (dots: typeof light) => Math.min(...dots.map((dot) => brightness(dot.color)));
    expect(dimmest(dark)).toBeGreaterThan(dimmest(light) + 30);
  });

  it("keeps one pool of dots across shapes so the hero can travel between them", () => {
    const counts = SPARK_SHAPES.map(
      (shape) => layoutSparkSlots(shape, 96, "#7C5CFF", SPARK_GAZE_CENTER).length,
    );
    expect(new Set(counts).size).toBe(1);
    const slots = layoutSparkSlots("heart", 96, "#7C5CFF", SPARK_GAZE_CENTER);
    expect(slots.map((slot) => slot.id)).toEqual(slots.map((_, index) => index));
    expect(slots.some((slot) => slot.d === 0)).toBe(true);
  });
});
