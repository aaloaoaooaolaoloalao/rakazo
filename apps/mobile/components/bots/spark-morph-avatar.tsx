import { useTimeout } from "@rakazo/chat-ui/hooks";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { View } from "react-native";
import { useReducedMotion } from "react-native-reanimated";
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

/** What moved the dots, which decides how they get there. */
type Motion = "gather" | "travel" | "gaze";
type Rgba = [number, number, number, number];
type Frame = { x: number; y: number; d: number; rgba: Rgba };
type Target = Frame & { delay: { gather: number; travel: number } };
type Move = { targets: Target[]; from: Frame[]; started: number; motion: Motion };

/** How long each kind of move takes, in ms, as the SwiftUI springs and snaps do. */
const DURATION: Record<Motion, number> = { gather: 750, travel: 500, gaze: 180 };
const BOUNCE: Record<Motion, number> = { gather: 0.18, travel: 0.24, gaze: 0 };
const COLOR_FADE = 350;

/**
 * The New bot hero, as in the SwiftUI app: a fixed pool of halftone dots that travel between
 * silhouettes when another shape is picked. It opens as dots spread over the avatar that gather
 * into the bot, then looks around and blinks while the screen is open. Dots are plain views, as in
 * `SparkDotAvatar`, moved frame by frame only while a move runs.
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
    // After the sheet has slid up, so the gather is seen rather than hidden by the slide.
    assembled ? null : 420,
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

  const targets = useMemo<Target[]>(
    () =>
      layoutSparkSlots(shape, size, color, gaze, ink).map((slot) => {
        const scatter = sparkScatter(slot.id, size, color, ink);
        const at = assembled ? slot : scatter;
        return {
          x: at.x,
          y: at.y,
          d: at.d,
          rgba: parseRgba(at.color),
          delay: { gather: scatter.delay, travel: slot.delay },
        };
      }),
    [shape, size, color, gaze, ink, assembled],
  );

  // A new set of targets starts a move from wherever the dots are drawn right now.
  const previous = useRef({ shape, assembled });
  const shown = useRef<Frame[]>([]);
  const move = useRef<Move | null>(null);
  const [now, setNow] = useState(0);
  if (move.current?.targets !== targets) {
    const motion: Motion =
      previous.current.assembled !== assembled
        ? "gather"
        : previous.current.shape !== shape
          ? "travel"
          : "gaze";
    move.current = {
      targets,
      from: shown.current.length === targets.length ? shown.current : targets,
      started: Date.now(),
      motion,
    };
  }
  const current = move.current;
  useEffect(() => {
    previous.current = { shape, assembled };
  });
  useEffect(() => {
    if (reduce) return;
    let frame = 0;
    const tick = () => {
      const time = Date.now();
      setNow(time);
      if (time - current.started < moveLength(current)) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [current, reduce]);

  const frames = reduce ? targets : frameAt(current, Math.max(now, current.started));
  shown.current = frames;
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ width: size, height: size, overflow: "hidden" }}
    >
      {frames.map((dot, index) =>
        dot.d > 0.2 ? (
          <View
            key={index}
            style={{
              position: "absolute",
              left: dot.x - dot.d / 2,
              top: dot.y - dot.d / 2,
              width: dot.d,
              height: dot.d,
              borderRadius: dot.d,
              backgroundColor: `rgba(${dot.rgba[0]}, ${dot.rgba[1]}, ${dot.rgba[2]}, ${dot.rgba[3]})`,
            }}
          />
        ) : null,
      )}
    </View>
  );
});

function delayOf(target: Target, motion: Motion): number {
  return motion === "gaze" ? 0 : target.delay[motion] * 1000;
}

function moveLength(move: Move): number {
  const longest = Math.max(0, ...move.targets.map((target) => delayOf(target, move.motion)));
  return Math.max(DURATION[move.motion] + longest, COLOR_FADE) + 32;
}

/** Settles at `p` = 1 with a small overshoot, like SwiftUI's `.spring(bounce:)`. */
function spring(p: number, bounce: number): number {
  if (p <= 0) return 0;
  if (p >= 1) return 1;
  if (!bounce) return 1 - (1 - p) ** 3;
  return 1 - Math.exp(-6 * p) * Math.cos(p * Math.PI * (1 + bounce * 2.2));
}

function frameAt(move: Move, time: number): Frame[] {
  const elapsed = time - move.started;
  const fade = Math.min(Math.max(elapsed / COLOR_FADE, 0), 1);
  return move.targets.map((to, index) => {
    const from = move.from[index] ?? to;
    const p = (elapsed - delayOf(to, move.motion)) / DURATION[move.motion];
    const e = spring(p, BOUNCE[move.motion]);
    return {
      x: mix(from.x, to.x, e),
      y: mix(from.y, to.y, e),
      d: Math.max(0, mix(from.d, to.d, e)),
      rgba: [
        Math.round(mix(from.rgba[0], to.rgba[0], fade)),
        Math.round(mix(from.rgba[1], to.rgba[1], fade)),
        Math.round(mix(from.rgba[2], to.rgba[2], fade)),
        Number(mix(from.rgba[3], to.rgba[3], fade).toFixed(3)),
      ],
    };
  });
}

function mix(from: number, to: number, t: number): number {
  return from + (to - from) * t;
}

function parseRgba(color: string): Rgba {
  const [r = 0, g = 0, b = 0, a = 0] = color
    .replace(/[^\d.,]/g, "")
    .split(",")
    .map(Number);
  return [r, g, b, a];
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
