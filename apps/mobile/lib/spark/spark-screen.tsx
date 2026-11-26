import { Redirect } from "expo-router";
import type { ReactNode } from "react";

/** A hidden Spark screen goes home, so a deep link cannot sit on a blank page. */
export function sparkScreen(shown: boolean, screen: ReactNode) {
  if (shown) return screen;
  return <Redirect href="/" />;
}
