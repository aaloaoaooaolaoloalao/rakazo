import { useTimeout } from "@rakazo/chat-ui/hooks";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { mobileBotAvatarPresentation } from "../../lib/bots/bot-avatar";
import type { SparkInk, SparkShape } from "../../lib/bots/spark-dot-geometry";
import {
  layoutSparkSlots,
  SPARK_GAZE_CENTER,
  SPARK_GAZE_ROUTINE,
  sparkScatter,
  sparkShape,
} from "../../lib/bots/spark-dot-geometry";
import { hapticImpact } from "../../lib/native/haptics";
import { useMobileTokens, useResolvedAppearance } from "../../lib/native/native";
import { SparkBotAvatar } from "./spark-bot-avatar";

/** What moved the dots this render, which decides how they get there. */
type Motion = "gather" | "travel" | "gaze";

/**
 * The New bot hero, as in the SwiftUI app: a fixed pool of halftone dots that travel between
 * silhouettes when another shape is picked. It opens as a small cluster that gathers into the
 * bot, then looks around and blinks while the screen is open.
 */
export const SparkMorphAvatar = memo(function SparkMorphAvatar({
  shape,
  color,
  size,
}: {
  shape: SparkShape;
  color: string;
  size: number;
}) {
  const reduce = useReducedMotion() === true;
  const ink: SparkInk = useResolvedAppearance();
  const [assembled, setAssembled] = useState(reduce);
  const [gaze, setGaze] = useState(SPARK_GAZE_CENTER);

  const [step, setStep] = useState(0);
  useEffect(() => {
    if (reduce) setAssembled(true);
  }, [reduce]);
  useTimeout(
    () => {
      setAssembled(true);
      hapticImpact();
    },
    assembled ? null : 150,
  );
  // Once gathered, glance and blink through the routine for as long as the screen is open.
  const routine = SPARK_GAZE_ROUTINE[step % SPARK_GAZE_ROUTINE.length]!;
  useTimeout(
    () => {
      setGaze(routine.gaze);
      setStep((current) => current + 1);
    },
    reduce || !assembled ? null : routine.holdMs,
    step,
  );

  const slots = useMemo(
    () => layoutSparkSlots(shape, size, color, gaze, ink),
    [shape, size, color, gaze, ink],
  );
  const previous = useRef({ shape, assembled });
  const motion: Motion =
    previous.current.assembled !== assembled
      ? "gather"
      : previous.current.shape !== shape
        ? "travel"
        : "gaze";
  useEffect(() => {
    previous.current = { shape, assembled };
  });

  const largest = Math.max(1, ...slots.map((slot) => slot.d));
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ width: size, height: size, overflow: "hidden" }}
    >
      {slots.map((slot) => {
        const scatter = sparkScatter(slot.id, size, color, ink);
        const target = assembled ? slot : scatter;
        return (
          <MorphDot
            key={slot.id}
            x={target.x}
            y={target.y}
            d={target.d}
            color={target.color}
            largest={largest}
            delay={motion === "gather" ? scatter.delay : slot.delay}
            motion={motion}
            blinking={gaze.blinking}
            reduce={reduce}
          />
        );
      })}
    </View>
  );
});

function MorphDot({
  x,
  y,
  d,
  color,
  largest,
  delay,
  motion,
  blinking,
  reduce,
}: {
  x: number;
  y: number;
  d: number;
  color: string;
  largest: number;
  delay: number;
  motion: Motion;
  blinking: boolean;
  reduce: boolean;
}) {
  const left = useSharedValue(x);
  const top = useSharedValue(y);
  const diameter = useSharedValue(d);
  const fill = useSharedValue(color);
  const move = (target: number) => {
    "worklet";
    if (reduce) return target;
    if (motion === "gather")
      return withDelay(delay * 1000, withSpring(target, { duration: 600, dampingRatio: 0.82 }));
    if (motion === "travel")
      return withDelay(delay * 1000, withSpring(target, { duration: 500, dampingRatio: 0.76 }));
    return withTiming(target, { duration: blinking ? 80 : 180 });
  };
  useEffect(() => {
    left.value = move(x);
  }, [x]);
  useEffect(() => {
    top.value = move(y);
  }, [y]);
  useEffect(() => {
    diameter.value = move(d);
  }, [d]);
  useEffect(() => {
    fill.value = reduce ? color : withTiming(color, { duration: 350 });
  }, [color, reduce, fill]);

  const style = useAnimatedStyle(() => ({
    backgroundColor: fill.value,
    transform: [
      { translateX: left.value - largest / 2 },
      { translateY: top.value - largest / 2 },
      { scale: Math.max(0, diameter.value) / largest },
    ],
  }));
  return (
    <Animated.View
      style={[
        { position: "absolute", left: 0, top: 0, width: largest, height: largest },
        { borderRadius: largest / 2 },
        style,
      ]}
    />
  );
}

/** The New bot hero: the look `SparkBotAvatar` draws, with dots that travel when the shape changes. */
export function SparkHeroAvatar({
  color,
  identity,
  size,
}: {
  color: string;
  identity?: string;
  size: number;
}) {
  const tokens = useMobileTokens();
  const parsed = mobileBotAvatarPresentation(color);
  if (parsed.kind === "image")
    return <SparkBotAvatar color={color} identity={identity} size={size} />;
  const fill =
    parsed.kind === "color" || parsed.kind === "shape" ? parsed.color : tokens.foreground;
  const shape = sparkShape(
    parsed.kind === "shape" ? parsed.shapeIndex : undefined,
    identity || fill || "agent",
  );
  return <SparkMorphAvatar shape={shape} color={fill} size={size} />;
}
