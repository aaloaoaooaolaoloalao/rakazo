import { credentialDigest } from "../secrets/credential-digest.js";
import type { PushRecord, PushSaveOptions, PushTokenStore } from "./push-token-store.js";

function pushSaveMeta(meta?: PushSaveOptions) {
  if (typeof meta === "string") return { presentation: meta };
  return meta;
}

type Row = PushRecord & { userId: string };

export class MemoryPushTokenStore implements PushTokenStore {
  private rows: Row[] = [];
  async list(userId: string) {
    return this.rows
      .filter((row) => row.userId === userId)
      .map(({ userId: _, ...record }) => record);
  }
  async save(userId: string, token: string, sessionId = "", meta?: PushSaveOptions) {
    const saved = pushSaveMeta(meta);
    this.rows = this.rows.filter(
      (row) =>
        row.token !== token && !(sessionId && row.userId === userId && row.sessionId === sessionId),
    );
    this.rows.push({
      userId,
      token,
      ...(sessionId ? { sessionId } : {}),
      ...(saved?.provider ? { provider: saved.provider } : {}),
      ...(saved?.environment !== undefined ? { environment: saved.environment } : {}),
      ...(saved?.presentation ? { presentation: saved.presentation } : {}),
    });
  }
  async importLegacy(userId: string, token: string, sessionId: string) {
    if (this.rows.some((row) => row.userId === userId || row.token === token)) return false;
    await this.save(userId, token, sessionId);
    return true;
  }
  async remove(userId: string, digest?: string) {
    this.rows = this.rows.filter(
      (row) =>
        row.userId !== userId || (digest !== undefined && credentialDigest(row.token) !== digest),
    );
  }
  async endSession(userId: string, sessionId: string, nextSessionId?: string) {
    this.rows = this.rows.flatMap((row) => {
      if (row.userId !== userId || row.sessionId !== sessionId) return [row];
      return nextSessionId ? [{ ...row, sessionId: nextSessionId }] : [];
    });
  }
}
