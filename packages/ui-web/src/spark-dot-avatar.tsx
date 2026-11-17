import type { LogoAvatarActivity } from "@rakazo/core";
import { useEffect, useRef } from "react";
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
  shape,
  color,
  size,
  mood,
  className,
}: {
  shape: Shape;
  color: string;
  size: number;
  mood: Mood;
  className?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let frame = 0;
    const draw = (now: number) => {
      const t = reduce ? 0 : now / 1000;
      const pose = poseAt(mood, t, reduce);
      paint(ctx, shape, color, size, pose);
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [shape, color, size, mood]);

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
  const half = size / 2;
  const lx = Math.sin(pose.yaw) * 0.8;
  const ly = 0.55;
  const lz = Math.cos(pose.yaw) * 0.5 + 0.6;
  const ll = Math.hypot(lx, ly, lz);
  ctx.clearRect(0, 0, size, size);
  for (const dot of dots) {
    if (eyeCols.includes(dot.col) && eyeRows.includes(dot.row)) continue;
    const u = (dot.x - half) / half;
    const v = (half - dot.y) / half;
    const z = Math.sqrt(Math.max(0.2, 1 - u * u - v * v));
    const nl = Math.hypot(u, v, z);
    let shade = 0.3 + 0.7 * Math.max(0, (u * lx + v * ly + z * lz) / (nl * ll));
    if (pose.ripple != null) {
      const ripple = 0.5 + 0.5 * Math.sin(Math.hypot(u, v) * 9 - pose.ripple);
      shade *= 0.6 + 0.4 * ripple;
    }
    const radius = step * 0.42 * (0.55 + 0.45 * shade);
    const ink = cells < 13 ? 0.4 + 0.4 * shade : 0.2 + 0.4 * Math.min(1, shade / 0.7);
    const tint = shade > 0.6 ? (shade - 0.6) / 0.4 : 0;
    ctx.beginPath();
    ctx.arc(dot.x, dot.y, radius, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(28, 37, 33, ${ink})`;
    ctx.fill();
    if (tint > 0) {
      ctx.fillStyle = hexAlpha(color, tint);
      ctx.fill();
    }
  }
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
