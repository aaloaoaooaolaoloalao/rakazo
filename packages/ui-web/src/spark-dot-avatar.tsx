import type { LogoAvatarActivity } from "@rakazo/core";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { cn } from "./lib/utils.js";

/** The iOS halftone characters, in the same order the app stores. */
export const SPARK_SHAPES = [
  "blob",
  "pebble",
  "squircle",
  "tablet",
  "wedge",
  "hex",
  "cloud",
  "teardrop",
  "star",
  "heart",
  "diamond",
  "flower",
  "ghost",
  "pill",
] as const;

type Shape = (typeof SPARK_SHAPES)[number];
type Mood = "idle" | "working" | "needsInput";

type Dot = { row: number; col: number; x: number; y: number };

export function sparkShape(index: number | undefined, identity: string): Shape {
  const n = index ?? hash(identity);
  return SPARK_SHAPES[((n % SPARK_SHAPES.length) + SPARK_SHAPES.length) % SPARK_SHAPES.length]!;
}

export function sparkMood(activity: LogoAvatarActivity | undefined, working: boolean): Mood {
  if (activity === "waiting") return "needsInput";
  if (working || (activity && activity !== "idle" && activity !== "error")) return "working";
  return "idle";
}

export function SparkDotAvatar({
  morph = false,
  ...props
}: {
  shape: Shape;
  color: string;
  size: number;
  mood: Mood;
  /** Offsets blink and glance so agents do not move in lockstep. */
  seed?: string;
  /** Create and edit hero: dots travel to the next shape and look around. */
  morph?: boolean;
  className?: string;
}) {
  if (morph) return <MorphDots {...props} />;
  return <CanvasDots {...props} />;
}

function CanvasDots({
  shape,
  color,
  size,
  mood,
  seed = "",
  className,
}: {
  shape: Shape;
  color: string;
  size: number;
  mood: Mood;
  seed?: string;
  className?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const phase = (hash(seed || shape) % 4700) / 1000;
    let frame = 0;
    const draw = (now: number) => {
      const t = reduce ? 0 : now / 1000 + phase;
      const pose = poseAt(mood, t, reduce);
      paint(ctx, shape, color, size, pose);
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [shape, color, size, mood, seed]);

  return (
    <canvas
      ref={ref}
      width={Math.round(size)}
      height={Math.round(size)}
      className={cn("spark-dot-avatar shrink-0", className)}
      data-spark-dots={shape}
      data-color={color}
      data-mood={mood}
      aria-hidden="true"
    />
  );
}

type Pose = { yaw: number; glance: number; blinking: boolean; ripple: number | null };

type Gaze = { dx: number; dy: number; blinking: boolean };

const LOOK_AROUND: { gaze: Gaze; hold: number }[] = [
  { gaze: { dx: 1, dy: 0, blinking: false }, hold: 900 },
  { gaze: { dx: 1, dy: -1, blinking: false }, hold: 500 },
  { gaze: { dx: 0, dy: 0, blinking: false }, hold: 600 },
  { gaze: { dx: 0, dy: 0, blinking: true }, hold: 1100 },
  { gaze: { dx: 0, dy: 0, blinking: false }, hold: 110 },
  { gaze: { dx: -1, dy: 0, blinking: false }, hold: 700 },
  { gaze: { dx: -1, dy: 1, blinking: false }, hold: 500 },
  { gaze: { dx: 0, dy: 0, blinking: false }, hold: 600 },
  { gaze: { dx: 0, dy: -1, blinking: false }, hold: 800 },
  { gaze: { dx: 0, dy: 0, blinking: false }, hold: 500 },
  { gaze: { dx: 0, dy: 0, blinking: true }, hold: 900 },
  { gaze: { dx: 0, dy: 0, blinking: false }, hold: 110 },
];

function useLookAround(): Gaze {
  const [gaze, setGaze] = useState<Gaze>({ dx: 0, dy: 0, blinking: false });
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let cancelled = false;
    let index = 0;
    let timer = 0;
    const next = () => {
      const step = LOOK_AROUND[index % LOOK_AROUND.length]!;
      index += 1;
      timer = window.setTimeout(() => {
        if (cancelled) return;
        setGaze(step.gaze);
        next();
      }, step.hold);
    };
    next();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, []);
  return gaze;
}

type MorphSlot = { id: number; x: number; y: number; d: number; color: string; delay: number };

function MorphDots({
  shape,
  color,
  size,
  className,
}: {
  shape: Shape;
  color: string;
  size: number;
  mood: Mood;
  seed?: string;
  className?: string;
}) {
  const gaze = useLookAround();
  const [slots, setSlots] = useState<MorphSlot[]>([]);
  const [shaping, setShaping] = useState(false);
  const firstShape = useRef(true);

  useEffect(() => {
    if (firstShape.current) {
      firstShape.current = false;
      return;
    }
    setShaping(true);
    const timer = window.setTimeout(() => setShaping(false), 620);
    return () => window.clearTimeout(timer);
  }, [shape]);

  useLayoutEffect(() => {
    setSlots(morphSlots(shape, size, color, gaze));
  }, [shape, size, color, gaze]);

  const reduce =
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const travel = "500ms cubic-bezier(0.22, 1.28, 0.36, 1)";

  return (
    <div
      className={cn("spark-dot-avatar relative shrink-0", className)}
      style={{ width: size, height: size }}
      data-spark-dots={shape}
      data-color={color}
      data-mood="idle"
      aria-hidden="true"
    >
      {slots.map((slot) => (
        <span
          key={slot.id}
          style={{
            position: "absolute",
            left: slot.x,
            top: slot.y,
            width: slot.d,
            height: slot.d,
            borderRadius: 999,
            backgroundColor: slot.color,
            transform: "translate(-50%, -50%)",
            transition: reduce
              ? "none"
              : shaping
                ? `left ${travel} ${slot.delay}ms, top ${travel} ${slot.delay}ms, width ${travel} ${slot.delay}ms, height ${travel} ${slot.delay}ms, background-color 350ms ease`
                : "width 180ms cubic-bezier(0.2, 0.8, 0.2, 1), height 180ms cubic-bezier(0.2, 0.8, 0.2, 1), background-color 180ms ease",
          }}
        />
      ))}
    </div>
  );
}

function morphSlots(shape: Shape, size: number, color: string, gaze: Gaze): MorphSlot[] {
  const cells = size < 18 ? 7 : size < 28 ? 9 : 13;
  const step = size / cells;
  const count = Math.max(...SPARK_SHAPES.map((name) => grid(name, size, step, cells).length), 0);
  const targets = [...grid(shape, size, step, cells)].sort(
    (a, b) => polarKey(a, size) - polarKey(b, size),
  );
  if (count === 0 || targets.length === 0) return [];
  const pose: Pose = { yaw: -0.7 + gaze.dx * 0.6, glance: 0, blinking: false, ripple: null };
  const eyeCols = eyeColList(cells).map((col) => col + gaze.dx);
  const baseRows = gaze.blinking ? eyeRowList(cells).slice(-1) : eyeRowList(cells);
  const eyeRows = baseRows.map((row) => row + gaze.dy);
  const half = size / 2;
  let previous = -1;
  return Array.from({ length: count }, (_, index) => {
    const targetIndex = Math.floor((index * targets.length) / count);
    const dot = targets[targetIndex]!;
    const look = shade(dot, size, step, cells, pose);
    const primary = targetIndex !== previous;
    previous = targetIndex;
    const eye = eyeCols.includes(dot.col) && eyeRows.includes(dot.row);
    const distance = Math.hypot(dot.x - half, dot.y - half) / half;
    return {
      id: index,
      x: dot.x,
      y: dot.y,
      d: (primary && !eye ? look.radius : 0.01) * 2,
      color: dotColor(color, look.ink, eye ? 0 : look.tint),
      delay: Math.min(distance, 1) * 80,
    };
  });
}

function polarKey(dot: Dot, size: number): number {
  const dx = dot.x - size / 2;
  const dy = dot.y - size / 2;
  return Math.atan2(dy, dx) * 100000 + Math.hypot(dx, dy);
}

function poseAt(mood: Mood, t: number, reduce: boolean): Pose {
  if (reduce || mood === "idle") {
    return { yaw: -0.7, glance: 0, blinking: !reduce && (t / 4.7) % 1 < 0.035, ripple: null };
  }
  if (mood === "needsInput") return { yaw: 0, glance: 0, blinking: false, ripple: t * 5 };
  return {
    yaw: t * 1.4,
    glance: Math.round(Math.sin((t * 2 * Math.PI) / 3.2) * 1.4),
    blinking: (t / 4.7) % 1 < 0.035,
    ripple: null,
  };
}

function paint(
  ctx: CanvasRenderingContext2D,
  shape: Shape,
  color: string,
  size: number,
  pose: Pose,
) {
  const cells = size < 18 ? 7 : size < 28 ? 9 : 13;
  const step = size / cells;
  const dots = grid(shape, size, step, cells);
  const eyeRows = pose.blinking ? eyeRowList(cells).slice(-1) : eyeRowList(cells);
  const eyeCols = eyeColList(cells).map((col) => col + pose.glance);
  ctx.clearRect(0, 0, size, size);
  for (const dot of dots) {
    if (eyeCols.includes(dot.col) && eyeRows.includes(dot.row)) continue;
    const look = shade(dot, size, step, cells, pose);
    ctx.beginPath();
    ctx.arc(dot.x, dot.y, look.radius, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(28, 37, 33, ${look.ink})`;
    ctx.fill();
    if (look.tint > 0) {
      ctx.fillStyle = hexAlpha(color, look.tint);
      ctx.fill();
    }
  }
}

function shade(dot: Dot, size: number, step: number, cells: number, pose: Pose) {
  const half = size / 2;
  const u = (dot.x - half) / half;
  const v = (half - dot.y) / half;
  const z = Math.sqrt(Math.max(0.2, 1 - u * u - v * v));
  const lx = Math.sin(pose.yaw) * 0.8;
  const ly = 0.55;
  const lz = Math.cos(pose.yaw) * 0.5 + 0.6;
  const nl = Math.hypot(u, v, z);
  const ll = Math.hypot(lx, ly, lz);
  let light = 0.3 + 0.7 * Math.max(0, (u * lx + v * ly + z * lz) / (nl * ll));
  if (pose.ripple != null) {
    const ripple = 0.5 + 0.5 * Math.sin(Math.hypot(u, v) * 9 - pose.ripple);
    light *= 0.6 + 0.4 * ripple;
  }
  return {
    radius: step * 0.42 * (0.55 + 0.45 * light),
    ink: cells < 13 ? 0.4 + 0.4 * light : 0.2 + 0.4 * Math.min(1, light / 0.7),
    tint: light > 0.6 ? (light - 0.6) / 0.4 : 0,
  };
}

function dotColor(hex: string, ink: number, tint: number): string {
  const raw = hex.replace("#", "");
  const n = Number.parseInt(raw.length >= 6 ? raw.slice(0, 6) : "1084FE", 16);
  const tintAlpha = tint + ink * (1 - tint);
  if (tintAlpha <= 0) return "rgba(0,0,0,0)";
  const red = (((n >> 16) & 255) * tint + 28 * ink * (1 - tint)) / tintAlpha;
  const green = (((n >> 8) & 255) * tint + 37 * ink * (1 - tint)) / tintAlpha;
  const blue = ((n & 255) * tint + 33 * ink * (1 - tint)) / tintAlpha;
  return `rgba(${red}, ${green}, ${blue}, ${tintAlpha})`;
}

const grids = new Map<string, Dot[]>();

function grid(shape: Shape, size: number, step: number, cells: number): Dot[] {
  const key = `${shape}:${Math.round(size)}:${cells}`;
  const cached = grids.get(key);
  if (cached) return cached;
  const dots: Dot[] = [];
  const mask = silhouette(shape, size);
  for (let row = 0; row < cells; row += 1) {
    for (let col = 0; col < cells; col += 1) {
      const x = (col + 0.5) * step;
      const y = (row + 0.5) * step;
      if (!mask || inside(mask, size, x, y)) dots.push({ row, col, x, y });
    }
  }
  grids.set(key, dots);
  return dots;
}

function silhouette(shape: Shape, size: number): ImageData | null {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(size);
  canvas.height = Math.ceil(size);
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  drawShape(ctx, shape, size);
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

function inside(mask: ImageData, size: number, x: number, y: number): boolean {
  const px = Math.min(mask.width - 1, Math.max(0, Math.floor(x)));
  const py = Math.min(mask.height - 1, Math.max(0, Math.floor(y)));
  return (mask.data[(py * mask.width + px) * 4 + 3] ?? 0) > 20;
}

function drawShape(ctx: CanvasRenderingContext2D, shape: Shape, size: number) {
  const w = size;
  const h = size;
  ctx.fillStyle = "#000";
  ctx.strokeStyle = "#000";
  ctx.lineJoin = "round";
  const fill = (run: () => void, width = 0) => {
    ctx.beginPath();
    run();
    ctx.fill();
    if (width > 0) {
      ctx.lineWidth = width;
      ctx.stroke();
    }
  };
  switch (shape) {
    case "pebble":
      fill(() => ctx.ellipse(w / 2, h / 2, w / 2, h * 0.4, 0, 0, Math.PI * 2));
      return;
    case "squircle":
      roundRect(ctx, w * 0.04, h * 0.04, w * 0.92, h * 0.92, w * 0.3);
      ctx.fill();
      return;
    case "tablet":
      roundRect(ctx, w * 0.14, 0, w * 0.72, h, w * 0.22);
      ctx.fill();
      return;
    case "pill":
      roundRect(ctx, w * 0.02, h * 0.24, w * 0.96, h * 0.52, h * 0.26);
      ctx.fill();
      return;
    case "hex":
      fill(() => poly(ctx, w, h, 6, 0.49, 0), w * 0.08);
      return;
    case "diamond":
      fill(() => {
        ctx.moveTo(w * 0.5, h * 0.04);
        ctx.lineTo(w * 0.96, h * 0.5);
        ctx.lineTo(w * 0.5, h * 0.96);
        ctx.lineTo(w * 0.04, h * 0.5);
        ctx.closePath();
      }, w * 0.06);
      return;
    case "star":
      fill(() => star(ctx, w, h), w * 0.08);
      return;
    case "cloud":
      fill(() => ctx.ellipse(w * 0.27, h * 0.57, w * 0.27, h * 0.27, 0, 0, Math.PI * 2));
      fill(() => ctx.ellipse(w * 0.72, h * 0.57, w * 0.27, h * 0.27, 0, 0, Math.PI * 2));
      fill(() => ctx.ellipse(w * 0.5, h * 0.4, w * 0.32, h * 0.32, 0, 0, Math.PI * 2));
      return;
    case "heart":
      fill(() => ctx.ellipse(w * 0.29, h * 0.35, w * 0.25, h * 0.25, 0, 0, Math.PI * 2));
      fill(() => ctx.ellipse(w * 0.71, h * 0.35, w * 0.25, h * 0.25, 0, 0, Math.PI * 2));
      fill(() => {
        ctx.moveTo(w * 0.08, h * 0.42);
        ctx.lineTo(w * 0.92, h * 0.42);
        ctx.lineTo(w * 0.5, h * 0.94);
        ctx.closePath();
      });
      return;
    case "flower":
      for (let i = 0; i < 5; i += 1) {
        const a = (i * 2 * Math.PI) / 5 - Math.PI / 2;
        fill(() =>
          ctx.ellipse(
            w / 2 + Math.cos(a) * w * 0.25,
            h / 2 + Math.sin(a) * h * 0.25,
            w * 0.23,
            h * 0.23,
            0,
            0,
            Math.PI * 2,
          ),
        );
      }
      fill(() => ctx.ellipse(w / 2, h / 2, w * 0.26, h * 0.26, 0, 0, Math.PI * 2));
      return;
    case "ghost":
      fill(() => ctx.ellipse(w / 2, h * 0.42, w * 0.38, h * 0.38, 0, 0, Math.PI * 2));
      fill(() => ctx.rect(w * 0.12, h * 0.42, w * 0.76, h * 0.42));
      for (const x of [0.25, 0.5, 0.75]) {
        fill(() => ctx.ellipse(w * x, h * 0.84, w * 0.13, h * 0.12, 0, 0, Math.PI * 2));
      }
      return;
    case "teardrop":
      fill(() => {
        ctx.moveTo(w * 0.5, 0);
        ctx.bezierCurveTo(w * 0.62, h * 0.2, w * 0.94, h * 0.38, w * 0.94, h * 0.62);
        ctx.arc(w * 0.5, h * 0.62, w * 0.44, 0, Math.PI, false);
        ctx.bezierCurveTo(w * 0.06, h * 0.38, w * 0.38, h * 0.2, w * 0.5, 0);
      });
      return;
    case "wedge":
      fill(() => {
        ctx.moveTo(w * 0.5, h * 0.04);
        ctx.quadraticCurveTo(w * 0.9, h * 0.4, w * 0.98, h * 0.86);
        ctx.quadraticCurveTo(w * 0.5, h * 1.04, w * 0.02, h * 0.86);
        ctx.quadraticCurveTo(w * 0.1, h * 0.4, w * 0.5, h * 0.04);
      });
      return;
    default:
      fill(() => {
        const steps = 64;
        for (let i = 0; i <= steps; i += 1) {
          const a = (i / steps) * Math.PI * 2;
          const radius = 0.46 + 0.035 * Math.sin(a * 3 + 0.6);
          const x = w / 2 + Math.cos(a) * w * radius;
          const y = h / 2 + Math.sin(a) * h * radius;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.closePath();
      });
  }
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

function poly(ctx: CanvasRenderingContext2D, w: number, h: number, sides: number, radius: number, turn: number) {
  for (let i = 0; i < sides; i += 1) {
    const a = (i * 2 * Math.PI) / sides - Math.PI / 2 + turn;
    const x = w / 2 + Math.cos(a) * w * radius;
    const y = h / 2 + Math.sin(a) * h * radius;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

function star(ctx: CanvasRenderingContext2D, w: number, h: number) {
  for (let i = 0; i < 10; i += 1) {
    const a = (i * Math.PI) / 5 - Math.PI / 2;
    const radius = i % 2 === 0 ? 0.46 : 0.26;
    const x = w / 2 + Math.cos(a) * w * radius;
    const y = h * 0.54 + Math.sin(a) * h * radius;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

function eyeColList(cells: number): number[] {
  if (cells === 7) return [2, 4];
  if (cells === 9) return [3, 6];
  return [4, 8];
}

function eyeRowList(cells: number): number[] {
  if (cells === 13) return [4, 5, 6];
  if (cells === 9) return [3, 4];
  return [2, 3];
}

function hexAlpha(hex: string, alpha: number): string {
  const raw = hex.replace("#", "");
  const n = Number.parseInt(raw.length >= 6 ? raw.slice(0, 6) : "1084FE", 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function hash(value: string): number {
  let n = 0;
  for (let i = 0; i < value.length; i += 1) n = (n * 33 + value.charCodeAt(i)) >>> 0;
  return n;
}
