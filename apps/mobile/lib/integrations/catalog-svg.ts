import type { Middleware } from "react-native-svg";

/** Icons larger than this fall back to their initial rather than parsing unbounded artwork. */
export const MAX_CATALOG_SVG_LENGTH = 512 * 1024;

const COLOR_PROPS = ["fill", "stroke", "stopColor", "floodColor", "lightingColor", "color"];

const PERCENT_RGB = /^rgb\(\s*([\d.]+)%\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%\s*\)$/i;

/** The native renderer rejects percentage `rgb()` colors, which design tools export for gradient
 * stops; it drops the stop and warns on every render. */
function byteColor(value: string) {
  if (value.length > 64) return value;
  const match = PERCENT_RGB.exec(value.trim());
  if (!match) return value;
  const [r, g, b] = match.slice(1).map((part) => Math.round(Math.min(100, Number(part)) * 2.55));
  return `rgb(${r},${g},${b})`;
}

/** Normalize parsed colors and style properties, leaving SVG text and other attributes untouched. */
export const catalogSvgStyles: Middleware = (root) => {
  const pending = [root];
  while (pending.length) {
    const node = pending.pop()!;
    for (const property of COLOR_PROPS) {
      const value = node.props[property];
      if (typeof value === "string") node.props[property] = byteColor(value);
    }
    const style = node.props.style;
    if (style && typeof style === "object") {
      for (const [property, value] of Object.entries(style)) {
        if (typeof value !== "string") continue;
        const color = COLOR_PROPS.includes(property) ? byteColor(value) : value;
        if (color !== value) {
          style[property] = color;
          continue;
        }
        const trimmed = value.trimEnd();
        if (trimmed.slice(-9).toLowerCase() !== "important") continue;
        const beforeWord = trimmed.slice(0, -9).trimEnd();
        if (beforeWord.endsWith("!")) style[property] = beforeWord.slice(0, -1).trimEnd();
      }
    }
    for (const child of node.children) if (typeof child !== "string") pending.push(child);
  }
  return root;
};
