import type { LogoAvatarActivity } from "@rakazo/core";

/** The iOS halftone characters, in the same order the app stores. Mirrors web `SPARK_SHAPES`. */
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

export type SparkShape = (typeof SPARK_SHAPES)[number];
export type SparkMood = "idle" | "working" | "needsInput";

type Point = { x: number; y: number };
type Pose = { yaw: number; glance: number; blinking: boolean; ripple: number | null };

export type SparkDot = { key: string; x: number; y: number; d: number; color: string };

export function sparkShape(index: number | undefined, identity: string): SparkShape {
  const n = index ?? hash(identity);
  return SPARK_SHAPES[((n % SPARK_SHAPES.length) + SPARK_SHAPES.length) % SPARK_SHAPES.length]!;
}

export function sparkMood(activity: LogoAvatarActivity | undefined, working: boolean): SparkMood {
  if (activity === "waiting") return "needsInput";
  if (working || (activity && activity !== "idle" && activity !== "error")) return "working";
  return "idle";
}

export function sparkPhase(seed: string, shape: SparkShape): number {
  return (hash(seed || shape) % 4700) / 1000;
}

export function poseAt(mood: SparkMood, t: number, reduce: boolean): Pose {
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

/**
 * The colour the unlit part of each dot fades toward. Like the SwiftUI app, which drew it with
 * the text colour: near-black on a light page, white on a dark one so the dim dots stay visible.
 */
export type SparkInk = "light" | "dark";
const INK_RGB: Record<SparkInk, readonly [number, number, number]> = {
  light: [28, 37, 33],
  dark: [255, 255, 255],
};

export function layoutSparkDots(
  shape: SparkShape,
  size: number,
  color: string,
  pose: Pose,
  ink: SparkInk = "light",
): SparkDot[] {
  const cells = size < 18 ? 7 : size < 28 ? 9 : 13;
  const step = size / cells;
  const dots = grid(shape, size, step, cells);
  const eyeRows = pose.blinking ? eyeRowList(cells).slice(-1) : eyeRowList(cells);
  const eyeCols = new Set(eyeColList(cells).map((col) => col + pose.glance));
  const eyeRowSet = new Set(eyeRows);
  const views: SparkDot[] = [];
  for (const dot of dots) {
    if (eyeCols.has(dot.col) && eyeRowSet.has(dot.row)) continue;
    const look = shade(dot, size, step, cells, pose);
    views.push({
      key: `${dot.row}:${dot.col}`,
      x: dot.x,
      y: dot.y,
      d: look.radius * 2,
      color: dotColor(color, look.ink, look.tint, INK_RGB[ink]),
    });
  }
  return views;
}

function shade(
  dot: { x: number; y: number },
  size: number,
  step: number,
  cells: number,
  pose: Pose,
) {
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

function dotColor(
  hex: string,
  ink: number,
  tint: number,
  [inkRed, inkGreen, inkBlue]: readonly [number, number, number],
): string {
  const raw = hex.replace("#", "");
  const n = Number.parseInt(raw.length >= 6 ? raw.slice(0, 6) : "1084FE", 16);
  const tintAlpha = tint + ink * (1 - tint);
  if (tintAlpha <= 0) return "rgba(0,0,0,0)";
  const red = (((n >> 16) & 255) * tint + inkRed * ink * (1 - tint)) / tintAlpha;
  const green = (((n >> 8) & 255) * tint + inkGreen * ink * (1 - tint)) / tintAlpha;
  const blue = ((n & 255) * tint + inkBlue * ink * (1 - tint)) / tintAlpha;
  return `rgba(${Math.round(red)}, ${Math.round(green)}, ${Math.round(blue)}, ${Math.min(1, tintAlpha).toFixed(3)})`;
}

type Cell = { row: number; col: number; x: number; y: number };
const grids = new Map<string, Cell[]>();

function grid(shape: SparkShape, size: number, step: number, cells: number): Cell[] {
  const key = `${shape}:${Math.round(size)}:${cells}`;
  const cached = grids.get(key);
  if (cached) return cached;
  const dots: Cell[] = [];
  for (let row = 0; row < cells; row += 1) {
    for (let col = 0; col < cells; col += 1) {
      const x = (col + 0.5) * step;
      const y = (row + 0.5) * step;
      if (inside(shape, x / size, y / size)) dots.push({ row, col, x, y });
    }
  }
  grids.set(key, dots);
  return dots;
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

function ellipse(x: number, y: number, cx: number, cy: number, rx: number, ry: number): boolean {
  const dx = (x - cx) / rx;
  const dy = (y - cy) / ry;
  return dx * dx + dy * dy <= 1;
}

function roundRect(x: number, y: number, rx: number, ry: number, w: number, h: number, r: number) {
  const cx = rx + w / 2;
  const cy = ry + h / 2;
  const dx = Math.abs(x - cx) - (w / 2 - r);
  const dy = Math.abs(y - cy) - (h / 2 - r);
  return Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) <= r;
}

function inPolygon(x: number, y: number, points: readonly Point[]): boolean {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i, i += 1) {
    const a = points[i]!;
    const b = points[j]!;
    const crosses = a.y > y !== b.y > y;
    if (crosses && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y + 0) + a.x) inside = !inside;
  }
  return inside;
}

const polygons = new Map<SparkShape, Point[]>();

type OutlinedShape = "blob" | "diamond" | "hex" | "star" | "teardrop" | "wedge";

function polygon(shape: OutlinedShape): Point[] {
  const cached = polygons.get(shape);
  if (cached) return cached;
  const points = outline(shape);
  polygons.set(shape, points);
  return points;
}

function inside(shape: SparkShape, x: number, y: number): boolean {
  switch (shape) {
    case "pebble":
      return ellipse(x, y, 0.5, 0.5, 0.5, 0.4);
    case "squircle":
      return roundRect(x, y, 0.04, 0.04, 0.92, 0.92, 0.3);
    case "tablet":
      return roundRect(x, y, 0.14, 0, 0.72, 1, 0.22);
    case "pill":
      return roundRect(x, y, 0.02, 0.24, 0.96, 0.52, 0.26);
    case "cloud":
      return (
        ellipse(x, y, 0.27, 0.57, 0.27, 0.27) ||
        ellipse(x, y, 0.72, 0.57, 0.27, 0.27) ||
        ellipse(x, y, 0.5, 0.4, 0.32, 0.32)
      );
    case "heart":
      return (
        ellipse(x, y, 0.29, 0.35, 0.25, 0.25) ||
        ellipse(x, y, 0.71, 0.35, 0.25, 0.25) ||
        inPolygon(x, y, [
          { x: 0.08, y: 0.42 },
          { x: 0.92, y: 0.42 },
          { x: 0.5, y: 0.94 },
        ])
      );
    case "flower": {
      if (ellipse(x, y, 0.5, 0.5, 0.26, 0.26)) return true;
      for (let i = 0; i < 5; i += 1) {
        const a = (i * 2 * Math.PI) / 5 - Math.PI / 2;
        if (ellipse(x, y, 0.5 + Math.cos(a) * 0.25, 0.5 + Math.sin(a) * 0.25, 0.23, 0.23))
          return true;
      }
      return false;
    }
    case "ghost":
      return (
        ellipse(x, y, 0.5, 0.42, 0.38, 0.38) ||
        (x >= 0.12 && x <= 0.88 && y >= 0.42 && y <= 0.84) ||
        ellipse(x, y, 0.25, 0.84, 0.13, 0.12) ||
        ellipse(x, y, 0.5, 0.84, 0.13, 0.12) ||
        ellipse(x, y, 0.75, 0.84, 0.13, 0.12)
      );
    default:
      return inPolygon(x, y, polygon(shape));
  }
}

function outline(shape: OutlinedShape): Point[] {
  switch (shape) {
    case "hex":
      return regular(6, 0.53, 0);
    case "diamond":
      return [
        { x: 0.5, y: 0.02 },
        { x: 0.98, y: 0.5 },
        { x: 0.5, y: 0.98 },
        { x: 0.02, y: 0.5 },
      ];
    case "star":
      return starPoints();
    case "teardrop":
      return teardrop();
    case "wedge":
      return wedge();
    case "blob":
      return blob();
    default: {
      const exhaustive: never = shape;
      return exhaustive;
    }
  }
}

function regular(sides: number, radius: number, turn: number): Point[] {
  return Array.from({ length: sides }, (_, i) => {
    const a = (i * 2 * Math.PI) / sides - Math.PI / 2 + turn;
    return { x: 0.5 + Math.cos(a) * radius, y: 0.5 + Math.sin(a) * radius };
  });
}

function starPoints(): Point[] {
  const points: Point[] = [];
  for (let i = 0; i < 10; i += 1) {
    const a = (i * Math.PI) / 5 - Math.PI / 2;
    const radius = i % 2 === 0 ? 0.5 : 0.28;
    points.push({ x: 0.5 + Math.cos(a) * radius, y: 0.54 + Math.sin(a) * radius });
  }
  return points;
}

function blob(): Point[] {
  const steps = 64;
  const points: Point[] = [];
  for (let i = 0; i < steps; i += 1) {
    const a = (i / steps) * Math.PI * 2;
    const radius = 0.46 + 0.035 * Math.sin(a * 3 + 0.6);
    points.push({ x: 0.5 + Math.cos(a) * radius, y: 0.5 + Math.sin(a) * radius });
  }
  return points;
}

function teardrop(): Point[] {
  const right = cubic(
    { x: 0.5, y: 0 },
    { x: 0.62, y: 0.2 },
    { x: 0.94, y: 0.38 },
    { x: 0.94, y: 0.62 },
    16,
  );
  const arc: Point[] = [];
  for (let i = 0; i <= 16; i += 1) {
    const a = (i / 16) * Math.PI;
    arc.push({ x: 0.5 + Math.cos(a) * 0.44, y: 0.62 + Math.sin(a) * 0.44 });
  }
  const left = cubic(
    { x: 0.06, y: 0.62 },
    { x: 0.06, y: 0.38 },
    { x: 0.38, y: 0.2 },
    { x: 0.5, y: 0 },
    16,
  );
  return [...right, ...arc, ...left];
}

function wedge(): Point[] {
  return [
    ...quad({ x: 0.5, y: 0.04 }, { x: 0.9, y: 0.4 }, { x: 0.98, y: 0.86 }, 12),
    ...quad({ x: 0.98, y: 0.86 }, { x: 0.5, y: 1.04 }, { x: 0.02, y: 0.86 }, 12),
    ...quad({ x: 0.02, y: 0.86 }, { x: 0.1, y: 0.4 }, { x: 0.5, y: 0.04 }, 12),
  ];
}

function cubic(p0: Point, p1: Point, p2: Point, p3: Point, steps: number): Point[] {
  const points: Point[] = [];
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const u = 1 - t;
    points.push({
      x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
      y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y,
    });
  }
  return points;
}

function quad(p0: Point, p1: Point, p2: Point, steps: number): Point[] {
  const points: Point[] = [];
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const u = 1 - t;
    points.push({
      x: u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x,
      y: u * u * p0.y + 2 * u * t * p1.y + t * t * p2.y,
    });
  }
  return points;
}

function hash(value: string): number {
  let n = 0;
  for (let i = 0; i < value.length; i += 1) n = (n * 33 + value.charCodeAt(i)) >>> 0;
  return n;
}

/** Where the create hero is looking: whole-cell eye steps, as in the SwiftUI app. */
export type SparkGaze = { dx: number; dy: number; blinking: boolean };
export const SPARK_GAZE_CENTER: SparkGaze = { dx: 0, dy: 0, blinking: false };

/** The SwiftUI hero's glance and blink loop: each gaze and how long it holds, in ms. */
export const SPARK_GAZE_ROUTINE: readonly { gaze: SparkGaze; holdMs: number }[] = [
  { gaze: { dx: 1, dy: 0, blinking: false }, holdMs: 900 },
  { gaze: { dx: 1, dy: -1, blinking: false }, holdMs: 500 },
  { gaze: SPARK_GAZE_CENTER, holdMs: 600 },
  { gaze: { dx: 0, dy: 0, blinking: true }, holdMs: 1100 },
  { gaze: SPARK_GAZE_CENTER, holdMs: 110 },
  { gaze: { dx: -1, dy: 0, blinking: false }, holdMs: 700 },
  { gaze: { dx: -1, dy: 1, blinking: false }, holdMs: 500 },
  { gaze: SPARK_GAZE_CENTER, holdMs: 600 },
  { gaze: { dx: 0, dy: -1, blinking: false }, holdMs: 800 },
  { gaze: SPARK_GAZE_CENTER, holdMs: 500 },
  { gaze: { dx: 0, dy: 0, blinking: true }, holdMs: 900 },
  { gaze: SPARK_GAZE_CENTER, holdMs: 110 },
];

/** One dot of the morphing hero. Its id stays the same across shapes, so it can travel. */
export type SparkSlot = SparkDot & { id: number; delay: number };

/** Outer dots leave a beat after the core, so the shape ripples outward as it reforms. */
const SLOT_MAX_STAGGER = 0.08;

/**
 * The create hero's fixed pool of dots placed on `shape`. Every shape gets the same number of
 * slots (the largest shape's dot count); extra slots fold into a neighbour at no size, and the
 * eye holes shrink to nothing, so moving between shapes is each dot travelling to a new cell.
 */
export function layoutSparkSlots(
  shape: SparkShape,
  size: number,
  color: string,
  gaze: SparkGaze,
  ink: SparkInk = "light",
): SparkSlot[] {
  const cells = size < 18 ? 7 : size < 28 ? 9 : 13;
  const step = size / cells;
  const count = Math.max(...SPARK_SHAPES.map((each) => grid(each, size, step, cells).length));
  const half = size / 2;
  const targets = [...grid(shape, size, step, cells)].sort((a, b) => {
    const pa = polar(a, half);
    const pb = polar(b, half);
    return pa[0] - pb[0] || pa[1] - pb[1];
  });
  if (count === 0 || targets.length === 0) return [];
  const pose: Pose = { yaw: -0.7 + gaze.dx * 0.6, glance: 0, blinking: false, ripple: null };
  const eyeCols = new Set(eyeColList(cells).map((col) => col + gaze.dx));
  const rows = eyeRowList(cells);
  const eyeRows = new Set((gaze.blinking ? rows.slice(-1) : rows).map((row) => row + gaze.dy));
  const slots: SparkSlot[] = [];
  let previous = -1;
  for (let id = 0; id < count; id += 1) {
    const index = Math.floor((id * targets.length) / count);
    const dot = targets[index]!;
    const primary = index !== previous;
    previous = index;
    const eye = eyeCols.has(dot.col) && eyeRows.has(dot.row);
    const look = shade(dot, size, step, cells, pose);
    const distance = Math.hypot(dot.x - half, dot.y - half) / half;
    slots.push({
      id,
      key: String(id),
      x: dot.x,
      y: dot.y,
      d: primary && !eye ? look.radius * 2 : 0,
      color: dotColor(color, look.ink, look.tint, INK_RGB[ink]),
      delay: Math.min(distance, 1) * SLOT_MAX_STAGGER,
    });
  }
  return slots;
}

/** Angle around the centre, then distance: neighbours in one shape stay neighbours in the next. */
function polar(cell: Cell, half: number): [number, number] {
  const dx = cell.x - half;
  const dy = cell.y - half;
  return [Math.atan2(dy, dx), Math.hypot(dx, dy)];
}

/** A stable spot for each dot in a tight cluster at the middle: where the opening gather starts. */
export function sparkScatter(id: number, size: number, color: string, ink: SparkInk = "light") {
  const rand = (salt: number) => {
    let x = (Math.imul(id, 2654435761) + Math.imul(salt, 40503)) >>> 0;
    x ^= x >>> 13;
    x = Math.imul(x, 0x5bd1e995) >>> 0;
    x ^= x >>> 15;
    return (x % 10000) / 10000;
  };
  const reach = size * 0.22;
  const x = size / 2 + (rand(1) - 0.5) * reach;
  const y = size / 2 + (rand(2) - 0.5) * reach;
  const distance = Math.hypot(x - size / 2, y - size / 2) / reach;
  return {
    x,
    y,
    d: 2 * (1 + rand(3) * 1.2),
    color: dotColor(color, 0.22, rand(4) * 0.35, INK_RGB[ink]),
    delay: Math.min(0.12, distance * 0.06 + rand(5) * 0.04),
  };
}
