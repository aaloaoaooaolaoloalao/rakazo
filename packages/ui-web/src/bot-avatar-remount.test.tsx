// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { BotAvatar } from "./bot-avatar.js";

beforeEach(() => vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true));
afterEach(() => vi.unstubAllGlobals());

it("keeps a bot's spark canvas and gives another bot its own character", () => {
  const container = document.createElement("div");
  const root = createRoot(container);
  const avatar = (identity: string, color: string) => (
    <BotAvatar avatarSet="rakazo" identity={identity} color={color} size={20} />
  );
  act(() => root.render(avatar("bot-a", "#8B5CF6")));
  const first = container.querySelector("canvas");
  expect(first?.getAttribute("data-spark-dots")).toBeTruthy();
  act(() => root.render(avatar("bot-a", "#3EC5A8")));
  expect(container.querySelector("canvas")).toBe(first);
  expect(container.querySelector("canvas")?.getAttribute("data-color")).toBe("#3EC5A8");
  act(() => root.render(avatar("bot-b", "#3EC5A8")));
  expect(container.querySelector("canvas")?.getAttribute("data-spark-dots")).toBeTruthy();
  act(() => root.unmount());
});
