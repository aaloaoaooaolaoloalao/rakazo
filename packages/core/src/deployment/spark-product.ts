/** Whether this API/worker process is a SparkAI product deployment (docker `SPARK=1`). */
export function sparkProductEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return sparkPublicFlag(env.SPARK) || sparkPublicFlag(env.EXPO_PUBLIC_SPARK);
}

function sparkPublicFlag(value: string | undefined): boolean {
  const normalized = value?.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}