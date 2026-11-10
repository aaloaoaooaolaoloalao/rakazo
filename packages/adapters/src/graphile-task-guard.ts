import {
  BACKGROUND_JOB_GRAPHILE_IDENTIFIERS,
  parseBackgroundJob,
  type BackgroundJobName,
} from "@rakazo/adapter-kit";
import { unwrapJobPayload } from "@rakazo/logging";
import type { Pool } from "pg";

/** Adapter-local queue task; paired with `run.continue` on the interactive runner. */
export const INTERACTIVE_RUN_GRAPHILE_TASK = "run.interactive";

/** Every Graphile task name any worker process may run or enqueue. */
export function allGraphileTaskIdentifiers(): string[] {
  return [...BACKGROUND_JOB_GRAPHILE_IDENTIFIERS, INTERACTIVE_RUN_GRAPHILE_TASK];
}

/**
 * Graphile Worker's `GC_TASK_IDENTIFIERS` deletes `_private_tasks` rows that no job
 * references. While workers keep a stale task_id cache, recycling an identifier onto
 * a new row makes the wrong handler run. Never run that GC against a live worker; pin
 * every identifier the app uses so maintenance cannot drop them between job prunes.
 */
export function createGraphileTaskIdentifierRegistrar(
  pool: Pick<Pool, "query">,
): () => Promise<void> {
  return async () => {
    await pool.query(
      `insert into graphile_worker._private_tasks (identifier)
       select unnest($1::text[])
       on conflict do nothing`,
      [allGraphileTaskIdentifiers()],
    );
  };
}

export class StaleGraphileTaskMappingError extends Error {
  constructor(
    readonly taskId: number,
    readonly slotIdentifier: string,
    readonly databaseIdentifier: string,
  ) {
    super(
      `Graphile task_id ${taskId} is "${databaseIdentifier}" in the database but this runner handles "${slotIdentifier}"`,
    );
    this.name = "StaleGraphileTaskMappingError";
  }
}

export async function graphileTaskIdentifierForId(
  pool: Pick<Pool, "query">,
  taskId: number,
): Promise<string | undefined> {
  const { rows } = await pool.query<{ identifier: string }>(
    "select identifier from graphile_worker._private_tasks where id = $1",
    [taskId],
  );
  return rows[0]?.identifier;
}

/**
 * Re-read the job's task row before dispatch. Graphile maps `task_id` to
 * `task_identifier` from an in-memory cache that does not refresh when `_private_tasks`
 * rows are deleted and identifiers are reused.
 */
export async function assertGraphileJobDispatch(
  pool: Pick<Pool, "query">,
  options: {
    taskId: number;
    slotIdentifier: string;
    handlerName: BackgroundJobName;
    payload: unknown;
  },
): Promise<void> {
  const databaseIdentifier = await graphileTaskIdentifierForId(pool, options.taskId);
  if (!databaseIdentifier) {
    throw new Error(`Graphile task_id ${options.taskId} has no row in _private_tasks`);
  }
  if (databaseIdentifier !== options.slotIdentifier) {
    throw new StaleGraphileTaskMappingError(
      options.taskId,
      options.slotIdentifier,
      databaseIdentifier,
    );
  }
  const { payload } = unwrapJobPayload(options.payload);
  parseBackgroundJob(options.handlerName, payload);
}
