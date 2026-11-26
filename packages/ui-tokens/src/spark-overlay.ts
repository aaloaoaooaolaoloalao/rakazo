/**
 * SparkAI accent on top of the mobile palette. Surfaces stay the iOS system
 * colors; only the blue accent moves to the same link and ring as Spark web.
 * Primary stays ink.
 */
export const sparkDarkAccent = {
  link: "#4D9BFF",
  ring: "#1884FC",
  statusWorking: "#4D9BFF",
  unread: "#4D9BFF",
} as const;

export const sparkLightAccent = {
  link: "#0B6DD3",
  ring: "#1E86FC",
  statusWorking: "#0B6DD3",
  unread: "#0B6DD3",
} as const;

export function applySparkMobileTokens<T extends Record<string, string>>(
  tokens: T,
  appearance: "light" | "dark",
): T {
  return { ...tokens, ...(appearance === "light" ? sparkLightAccent : sparkDarkAccent) };
}
