import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { TransactionalEmailProvider } from "@rakazo/adapter-kit";
import { getLogger } from "@rakazo/logging";
import { Hono } from "hono";
import { readBoundedBody } from "./http-body.js";

/**
 * Two small endpoints for the native app:
 * - GET  /api/announcements   server-driven announcements, read from ANNOUNCEMENTS_JSON.
 * - POST /api/feedback/bug-reports   shake-to-report from TestFlight/debug builds.
 * Both are limited by the API rate limiter ("read" and "bug_report" buckets).
 */
export const MAX_BUG_REPORT_BYTES = 4 * 1024 * 1024;
const MAX_TEXT = 4000;

export interface Announcement {
  id: string;
  title: string;
  body: string;
  buttonTitle?: string;
  url?: string;
  minAppVersion?: string;
  maxAppVersion?: string;
  platforms?: string[];
}

export interface AppFeedbackDeps {
  announcementsJson: string | undefined;
  bugReportsDir: string | undefined;
  adminEmails: string[];
  email?: TransactionalEmailProvider;
  onEmailError?: (error: unknown) => void;
  userIdFor: (request: Request) => Promise<string | undefined>;
}

/** Compares dotted numeric versions ("2.0.10" > "2.0.9"). */
export function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map((n) => Number.parseInt(n, 10) || 0);
  const pb = b.split(".").map((n) => Number.parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return Math.sign(diff);
  }
  return 0;
}

export function parseAnnouncements(raw: string | undefined): Announcement[] {
  if (!raw?.trim()) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is Announcement =>
        isRecord(item) &&
        typeof item.id === "string" &&
        typeof item.title === "string" &&
        typeof item.body === "string",
    );
  } catch {
    getLogger().warn("announcements.invalid_json");
    return [];
  }
}

export function announcementsFor(
  all: Announcement[],
  platform: string | undefined,
  version: string | undefined,
): Announcement[] {
  return all.filter((item) => {
    if (platform && item.platforms?.length && !item.platforms.includes(platform)) return false;
    if (version && item.minAppVersion && compareVersions(version, item.minAppVersion) < 0)
      return false;
    if (version && item.maxAppVersion && compareVersions(version, item.maxAppVersion) > 0)
      return false;
    return true;
  });
}

export function appFeedbackRoutes(deps: AppFeedbackDeps) {
  const app = new Hono();
  const announcements = parseAnnouncements(deps.announcementsJson);

  app.get("/api/announcements", (c) => {
    const items = announcementsFor(announcements, c.req.query("platform"), c.req.query("version"));
    c.header("cache-control", "private, max-age=300");
    return c.json({ announcements: items });
  });

  app.post("/api/feedback/bug-reports", async (c) => {
    const userId = await deps.userIdFor(c.req.raw);
    if (!userId) return c.json({ error: "unauthorized" }, 401);
    const raw = await readBoundedBody(c.req.raw, MAX_BUG_REPORT_BYTES);
    if (raw === null) return c.json({ error: "too_large" }, 413);
    let body: Record<string, unknown>;
    try {
      const parsed: unknown = JSON.parse(raw);
      if (!isRecord(parsed)) throw new Error("not an object");
      body = parsed;
    } catch {
      return c.json({ error: "invalid_json" }, 400);
    }
    const text = (key: string, max = 128) =>
      typeof body[key] === "string" ? (body[key] as string).slice(0, max) : "";
    const description = text("description", MAX_TEXT).trim();
    if (!description) return c.json({ error: "description_required" }, 400);
    const screenshot = typeof body.screenshotPng === "string" ? body.screenshotPng : undefined;
    const report = {
      id: randomUUID(),
      userId,
      receivedAt: new Date().toISOString(),
      description,
      appVersion: text("appVersion"),
      build: text("build"),
      device: text("device"),
      osVersion: text("osVersion"),
      screen: text("screen"),
      hasScreenshot: Boolean(screenshot),
    };
    getLogger().warn("app.bug_report", {
      "bug_report.id": report.id,
      "user.id": userId,
      ...report,
    });
    if (deps.bugReportsDir) {
      const dir = join(deps.bugReportsDir, report.id);
      await mkdir(dir, { recursive: true });
      await writeFile(join(dir, "report.json"), JSON.stringify(report, null, 2));
      if (screenshot)
        await writeFile(join(dir, "screenshot.png"), Buffer.from(screenshot, "base64"));
    }
    if (deps.email) {
      for (const to of deps.adminEmails) {
        void deps.email
          .send({
            to,
            subject: `Bug report ${report.appVersion} (${report.build}) on ${report.device}`,
            text: `${description}\n\n${JSON.stringify({ ...report, description: undefined }, null, 2)}`,
          })
          .catch((error) => deps.onEmailError?.(error));
      }
    }
    return c.json({ id: report.id }, 201);
  });

  return app;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
