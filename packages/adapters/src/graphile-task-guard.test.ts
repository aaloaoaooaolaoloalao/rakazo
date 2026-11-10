import { routineWakeupJob } from "@rakazo/adapter-kit";
import { wrapJobPayload } from "@rakazo/logging";
import type { Pool } from "pg";
import { describe, expect, it, vi } from "vitest";
import {
  allGraphileTaskIdentifiers,
  assertGraphileJobDispatch,
  createGraphileTaskIdentifierRegistrar,
  StaleGraphileTaskMappingError,
} from "./graphile-task-guard.js";

describe("graphile task guard", () => {
  it("pins every app task identifier without deleting task rows", async () => {
    const query = vi.fn(async () => ({ rows: [] }));
    await createGraphileTaskIdentifierRegistrar({ query } as unknown as Pick<Pool, "query">)();
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("insert into graphile_worker._private_tasks"),
      [allGraphileTaskIdentifiers()],
    );
    const sql = String(query.mock.calls.at(0)?.at(0) ?? "");
    expect(sql).not.toContain("delete from");
  });

  it("allows dispatch when the database identifier matches the runner slot", async () => {
    const query = vi.fn(async () => ({ rows: [{ identifier: "routine.wakeup" }] }));
    const pool = { query } as unknown as Pick<Pool, "query">;
    await assertGraphileJobDispatch(pool, {
      taskId: 1,
      slotIdentifier: "routine.wakeup",
      handlerName: "routine.wakeup",
      payload: wrapJobPayload(routineWakeupJob("routine-1", new Date()).payload),
    });
  });

  it("rejects a routine payload on a run slot before zod runs in the handler", async () => {
    const query = vi.fn(async () => ({ rows: [{ identifier: "routine.wakeup" }] }));
      const pool = { query } as unknown as Pick<Pool, "query">;
    await expect(
      assertGraphileJobDispatch(pool, {
        taskId: 1,
        slotIdentifier: "run.interactive",
        handlerName: "run.continue",
        payload: wrapJobPayload(routineWakeupJob("routine-1", new Date()).payload),
      }),
    ).rejects.toBeInstanceOf(StaleGraphileTaskMappingError);
  });
});
