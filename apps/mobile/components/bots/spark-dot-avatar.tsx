import { memo, useEffect, useState } from "react";
import { View } from "react-native";
import { useReducedMotion } from "react-native-reanimated";
import type { SparkMood, SparkShape } from "../../lib/bots/spark-dot-geometry";
import { layoutSparkDots, poseAt, sparkPhase } from "../../lib/bots/spark-dot-geometry";
import { useResolvedAppearance } from "../../lib/native/native";

/**
 * React Native port of web `SparkDotAvatar`: the same halftone shapes, eye holes,
 * and light. Idle stays on the resting pose so a list of agents does not animate;
 * working and needs-input poses follow the web clock.
 */
export const SparkDotAvatar = memo(function SparkDotAvatar({
  shape,
  color,
  size,
  mood,
  seed = "",
  blink = false,
}: {
  shape: SparkShape;
  color: string;
  size: number;
  mood: SparkMood;
  seed?: string;
  /** Closes the eyes now, whatever the pose would do. */
  blink?: boolean;
}) {
  const reduce = useReducedMotion() === true;
  const appearance = useResolvedAppearance();
  const animate = !reduce && mood !== "idle";
  const [time, setTime] = useState(0);
  useEffect(() => {
    if (!animate) return;
    let frame = 0;
    const started = Date.now();
    const tick = () => {
      setTime((Date.now() - started) / 1000);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [animate]);

  const posed = poseAt(mood, time + sparkPhase(seed, shape), reduce || mood === "idle");
  const pose = blink ? { ...posed, blinking: true } : posed;
  const dots = layoutSparkDots(shape, size, color, pose, appearance);
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ width: size, height: size }}
    >
      {dots.map((dot) => (
        <View
          key={dot.key}
          style={{
            position: "absolute",
            left: dot.x - dot.d / 2,
            top: dot.y - dot.d / 2,
            width: dot.d,
            height: dot.d,
            borderRadius: dot.d,
            backgroundColor: dot.color,
          }}
        />
      ))}
    </View>
  );
});
