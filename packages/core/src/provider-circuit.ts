import { errorStatus } from "./retry-policy.js";

/** Opens after this many retryable provider failures inside the window. */
const FAILURES_TO_OPEN = 5;
const WINDOW_MS = 30_000;
const OPEN_MS = 15_000;

export class ProviderCircuit {
  private failures: number[] = [];
  private openUntil = 0;

  note(error: unknown, now = Date.now()) {
    const status = errorStatus(error);
    if (status !== 429 && (status === undefined || status < 500)) return;
    this.failures = this.failures.filter((at) => now - at < WINDOW_MS);
    this.failures.push(now);
    if (this.failures.length >= FAILURES_TO_OPEN) {
      const jitter = Math.floor(Math.random() * 2_000);
      this.openUntil = now + OPEN_MS + jitter;
      this.failures = [];
    }
  }

  /** True when new model calls should fail cleanly instead of retrying into a provider outage. */
  isOpen(now = Date.now()): boolean {
    return now < this.openUntil;
  }
}

export const providerCircuit = new ProviderCircuit();
export const PROVIDER_UNAVAILABLE_CODE = "provider_unavailable";
