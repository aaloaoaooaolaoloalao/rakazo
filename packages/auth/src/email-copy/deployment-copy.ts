import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { translate } from "@rakazo/core";
import { getLogger } from "@rakazo/logging";
import type { EmailCopyId } from "./email-keys.js";
import { EMAIL_COPY_KEYS, EMAIL_LOCALES } from "./email-keys.js";
import { sparkEmailFallback } from "./spark-email-fallback.js";
import type { CopyByLocale } from "./validate.js";
import { readCopyFile } from "./validate.js";

type Key<Id extends EmailCopyId> = keyof (typeof EMAIL_COPY_KEYS)[Id] & string;
export type SayCopy<Id extends EmailCopyId> = (
  key: Key<Id>,
  values?: Record<string, string | number>,
) => string;

/** What reading one email's copy found; `off` names why the email is not sent. */
export type EmailCopyReport =
  | { email: EmailCopyId; off: "missing" | "invalid"; problems: string[] }
  | { email: EmailCopyId; off?: undefined; problems: string[] };

function logReport({ email, off, problems }: EmailCopyReport): void {
  const attributes = { "email.kind": email, "email_copy.problems": problems.join("; ") };
  if (off === "missing")
    getLogger().info(
      "deployment email copy is missing; in-code English is used when it exists",
      attributes,
    );
  else if (off === "invalid")
    getLogger().warn(
      "deployment email copy has no valid English for every key; in-code English is used when it exists",
      attributes,
    );
  else if (problems.length > 0)
    getLogger().warn("email copy falls back to the file's English", attributes);
}

/**
 * Reads a deployment's email copy from `dir` (`<email>.json`, app language to key to text), once
 * per email, and reports each email once. A complete English file is the copy that is sent;
 * another language's missing or invalid string falls back to that English. Welcome, referral,
 * and model-connection mail still send from the in-code English when the file is missing.
 */
export function emailCopyReader(
  dir: string | undefined,
  report: (report: EmailCopyReport) => void = logReport,
) {
  const loaded = new Map<EmailCopyId, CopyByLocale | null>();
  const load = (id: EmailCopyId): CopyByLocale | null => {
    const cached = loaded.get(id);
    if (cached !== undefined) return cached;
    const file = dir ? join(dir, `${id}.json`) : undefined;
    let copy: CopyByLocale | null = null;
    if (!file || !existsSync(file))
      report({ email: id, off: "missing", problems: [file ? `no ${file}` : "no EMAIL_COPY_DIR"] });
    else {
      try {
        const read = readCopyFile(
          EMAIL_COPY_KEYS,
          EMAIL_LOCALES,
          id,
          JSON.parse(readFileSync(file, "utf8")),
        );
        if (read.complete) copy = read.copy;
        report(
          read.complete
            ? { email: id, problems: read.problems }
            : { email: id, off: "invalid", problems: read.problems },
        );
      } catch (error) {
        report({
          email: id,
          off: "invalid",
          problems: [`${id}: ${error instanceof Error ? error.message : String(error)}`],
        });
      }
    }
    loaded.set(id, copy);
    return copy;
  };
  return {
    available: (id: EmailCopyId): boolean => load(id) !== null,
    copy:
      <Id extends EmailCopyId>(id: Id, locale: string): SayCopy<Id> =>
      (key, values) => {
        const copy = load(id);
        const text = copy?.[locale]?.[key] ?? copy?.en?.[key];
        if (text === undefined) throw new Error(`The ${id} email has no copy`);
        return translate(undefined, text, values);
      },
  };
}

const readers = new Map<string, ReturnType<typeof emailCopyReader>>();

function deploymentCopy() {
  const dir = process.env.EMAIL_COPY_DIR?.trim() ?? "";
  let reader = readers.get(dir);
  if (!reader) {
    reader = emailCopyReader(dir || undefined);
    readers.set(dir, reader);
  }
  return reader;
}

/**
 * Whether this email can be sent. A complete `EMAIL_COPY_DIR` file wins. Welcome,
 * referral, and model-connection mail still send from the in-code SparkAI English
 * when that file is missing or incomplete.
 */
export function emailCopyAvailable(id: EmailCopyId): boolean {
  return deploymentCopy().available(id) || sparkEmailFallback(id) !== undefined;
}

/** Deployment copy when it is complete; otherwise the SparkAI English fallback, when one exists. */
export function emailCopy<Id extends EmailCopyId>(id: Id, locale: string): SayCopy<Id> {
  if (deploymentCopy().available(id)) return deploymentCopy().copy(id, locale);
  const fallback = sparkEmailFallback(id);
  if (fallback) return fallback as SayCopy<Id>;
  return deploymentCopy().copy(id, locale);
}
