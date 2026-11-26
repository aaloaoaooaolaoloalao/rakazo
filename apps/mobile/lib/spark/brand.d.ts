import type { ExpoConfig } from "expo/config";

export function sparkEnvEnabled(env?: Record<string, string | undefined>): boolean;

export function applySparkBrand(
  config: ExpoConfig,
  env?: Record<string, string | undefined>,
): ExpoConfig;

export const SPARK_SLUG: string;
export const SPARK_EAS_PROJECT_ID: string;
export const SPARK_EXPO_OWNER: string;
export const SPARK_EAS_PROJECT_PLACEHOLDER: string;
