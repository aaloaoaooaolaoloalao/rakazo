import { mkdtemp, readdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  announcementsFor,
  appFeedbackRoutes,
  compareVersions,
  parseAnnouncements,
} from "./app-feedback.js";

const announcements = JSON.stringify([
  { id: "a1", title: "Hi", body: "All", platforms: ["ios"] },
  { id: "a2", title: "New", body: "2.1+", minAppVersion: "2.1.0" },
  { id: "a3", title: "Old", body: "<=2.0", maxAppVersion: "2.0.9" },
  { nope: true },
]);

describe("announcements", () => {
  it("compares versions numerically", () => {
    expect(compareVersions("2.0.10", "2.0.9")).toBe(1);
    expect(compareVersions("2.0", "2.0.0")).toBe(0);
    expect(compareVersions("1.9", "2.0")).toBe(-1);
  });

  it("filters by platform and version and drops malformed entries", () => {
    const all = parseAnnouncements(announcements);
    expect(all.map((a) => a.id)).toEqual(["a1", "a2", "a3"]);
    expect(announcementsFor(all, "ios", "2.0.0").map((a) => a.id)).toEqual(["a1", "a3"]);
    expect(announcementsFor(all, "web", "2.1.0").map((a) => a.id)).toEqual(["a2"]);
    expect(parseAnnouncements("{bad")).toEqual([]);
  });

  it("serves the filtered list", async () => {
    const app = appFeedbackRoutes({
      announcementsJson: announcements,
      bugReportsDir: undefined,
      adminEmails: [],
      userIdFor: async () => undefined,
    });
    const response = await app.request("/api/announcements?platform=ios&version=2.2.0");
    expect(await response.json()).toEqual({
      announcements: [expect.objectContaining({ id: "a1" }), expect.objectContaining({ id: "a2" })],
    });
  });
});

describe("bug reports", () => {
  const post = (app: ReturnType<typeof appFeedbackRoutes>, body: unknown) =>
    app.request("/api/feedback/bug-reports", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });

  it("requires a signed-in user and a description", async () => {
    const deps = { announcementsJson: undefined, bugReportsDir: undefined, adminEmails: [] };
    expect(
      (await post(appFeedbackRoutes({ ...deps, userIdFor: async () => undefined }), {})).status,
    ).toBe(401);
    expect(
      (await post(appFeedbackRoutes({ ...deps, userIdFor: async () => "u" }), {})).status,
    ).toBe(400);
  });

  it("stores the report and screenshot and emails admins", async () => {
    const dir = await mkdtemp(join(tmpdir(), "bug-reports-"));
    const send = vi.fn(async () => undefined);
    const app = appFeedbackRoutes({
      announcementsJson: undefined,
      bugReportsDir: dir,
      adminEmails: ["admin@example.test"],
      email: { describe: vi.fn() as never, send },
      userIdFor: async () => "user-1",
    });
    const response = await post(app, {
      description: "Chat froze",
      appVersion: "2.0.0",
      build: "120",
      device: "iPhone17,1",
      osVersion: "26.1",
      screenshotPng: Buffer.from("png").toString("base64"),
    });
    expect(response.status).toBe(201);
    const { id } = (await response.json()) as { id: string };
    expect(await readdir(join(dir, id))).toEqual(["report.json", "screenshot.png"]);
    expect(JSON.parse(await readFile(join(dir, id, "report.json"), "utf8"))).toMatchObject({
      userId: "user-1",
      description: "Chat froze",
      hasScreenshot: true,
    });
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ to: "admin@example.test" }));
  });
});
