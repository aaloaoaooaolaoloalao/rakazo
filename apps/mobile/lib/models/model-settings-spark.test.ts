import { afterEach, describe, expect, it, vi } from "vitest";

const push = vi.hoisted(() => vi.fn());
const alert = vi.hoisted(() => vi.fn());

vi.mock("expo-router", () => ({ router: { push } }));
vi.mock("react-native", () => ({ Alert: { alert } }));

import { askToAddModel, openModelSettings } from "./model-settings";

afterEach(() => {
  vi.unstubAllEnvs();
  push.mockClear();
  alert.mockClear();
});

describe("model settings entry points", () => {
  it("stays closed when the Spark flag is on", () => {
    vi.stubEnv("EXPO_PUBLIC_SPARK", "1");
    openModelSettings("space-1");
    askToAddModel();
    expect(push).not.toHaveBeenCalled();
    expect(alert).not.toHaveBeenCalled();
  });
});
