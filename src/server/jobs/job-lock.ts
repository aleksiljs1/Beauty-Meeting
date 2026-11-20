import "server-only";
import pg from "pg";
import { env } from "@/server/env";

/**
 * Runs a background job's tick only if no other server process is running the same job right now;
 * every web process starts the jobs (instrumentation.ts), so with more than one replica (or an old
 * and a new one overlapping during a deploy) they would otherwise run side by side.
 *
 * How: a session-level Postgres advisory lock taken on its own short-lived connection, opened for
 * this tick and closed after it. Why not the alternatives:
 * - Prisma's pooled connections: a session lock must be released on the connection that took it,
 *   and the pool gives no such guarantee.
 * - `pg_try_advisory_xact_lock` in an interactive `prisma.$transaction`: it keeps a transaction
 *   open (and one pooled connection busy) for the whole run — up to hours for a recording import —
 *   and Prisma's transaction timeout would abort a long job halfway.
 * - A lease row: needs a schema change and a lease length guessed against the slowest job.
 * Postgres drops a session lock by itself when its connection closes, so a crashed or killed
 * process never leaves the lock behind. If that connection breaks mid-run, the lock is gone and
 * another process may start the job too — rare (it takes a dropped database connection) and no
 * worse than running without the lock, for that one run.
 *
 * Never throws for its own problems (database unreachable, lock busy): it logs and skips this run,
 * and the next tick tries again. Errors from `run` reach the caller as before.
 */
export async function withJobLock(name: string, run: () => Promise<void>): Promise<void> {
  let client: pg.Client | null = null;
  try {
    client = new pg.Client({ connectionString: env.DATABASE_URL, keepAlive: true, connectionTimeoutMillis: 10_000 });
    // An unhandled "error" event (e.g. the database restarting mid-run) would crash the process.
    client.on("error", (error) => console.error(`[jobs] lock connection for ${name} failed`, error.message));
    await client.connect();
    const { rows } = await client.query<{ locked: boolean }>("SELECT pg_try_advisory_lock(hashtext($1)) AS locked", [`academy-job:${name}`]);
    if (!rows[0]?.locked) {
      await client.end().catch(() => undefined);
      return; // another process is running this job
    }
  } catch (error) {
    console.error(`[jobs] could not take the lock for ${name}; skipping this run`, (error as Error).message);
    await client?.end().catch(() => undefined);
    return;
  }
  try {
    await run();
  } finally {
    // Closing the session releases the lock.
    await client.end().catch(() => undefined);
  }
}
