import "server-only";
import { eq, sql, desc } from "drizzle-orm";
import { db } from "../db/client";
import { scopes, syncJobs } from "../db/schema";
import { previewNetBox, applyNetBox } from "./netbox-sync";
import { AppError } from "./errors";
import { sourceMode } from "../collectors/live";

export async function enqueue(
  scopeId: string,
  eventKey: string,
  trigger: "event" | "poll" | "source_change",
) {
  const [scope] = await db
    .select({ id: scopes.id, enabled: scopes.enabled })
    .from(scopes)
    .where(eq(scopes.id, scopeId));
  if (!scope || !scope.enabled)
    throw new AppError("NOT_FOUND", "Enabled scope not found", 404);
  const [job] = await db
    .insert(syncJobs)
    .values({ scopeId, eventKey, trigger })
    .onConflictDoNothing()
    .returning();
  return (
    job ??
    (
      await db
        .select()
        .from(syncJobs)
        .where(
          sql`${syncJobs.scopeId}=${scopeId} and ${syncJobs.eventKey}=${eventKey}`,
        )
    )[0]
  );
}
export async function enqueuePolls() {
  const interval = Number(process.env.SYNC_POLL_SECONDS || 300);
  if (!Number.isInteger(interval) || interval < 10 || interval > 86400)
    throw new Error("SYNC_POLL_SECONDS must be 10–86400");
  const bucket = Math.floor(Date.now() / (interval * 1000));
  const enabled = await db
    .select({ id: scopes.id })
    .from(scopes)
    .where(eq(scopes.enabled, true));
  for (const scope of enabled)
    await enqueue(scope.id, `poll:${bucket}`, "poll");
  return enabled.length;
}
type Job = typeof syncJobs.$inferSelect;
async function claim(): Promise<Job | undefined> {
  const result = await db.execute(sql`with candidate as (
    select id from sync_jobs where (status='pending' and available_at<=now()) or (status='running' and started_at<now()-interval '15 minutes')
    order by available_at,created_at for update skip locked limit 1
  ) update sync_jobs set status='running',attempts=attempts+1,started_at=now(),updated_at=now()
    where id=(select id from candidate) returning *`);
  const row = result.rows[0] as Record<string, unknown> | undefined;
  if (!row) return undefined;
  return {
    id: row.id,
    scopeId: row.scope_id,
    eventKey: row.event_key,
    trigger: row.trigger,
    status: row.status,
    attempts: row.attempts,
    availableAt: row.available_at,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    lastError: row.last_error,
    localRunId: row.local_run_id,
    netboxRunId: row.netbox_run_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  } as Job;
}
export async function processNextJob() {
  const job = await claim();
  if (!job) return { processed: false };
  let netboxRunId = job.netboxRunId;
  try {
    if (!netboxRunId) {
      const plan = await previewNetBox([job.scopeId]);
      if (plan.scopes.some((s) => s.collectionStatus !== "complete"))
        throw new Error(
          plan.scopes[0]?.error || "Source collection incomplete",
        );
      const result = await applyNetBox(plan.planId);
      if (result.status !== "completed")
        throw new Error(
          result.skipped?.[0]?.error || "NetBox sync did not complete",
        );
      netboxRunId = result.runId;
      await db
        .update(syncJobs)
        .set({ netboxRunId })
        .where(eq(syncJobs.id, job.id));
    }
    await db
      .update(syncJobs)
      .set({
        status: "completed",
        finishedAt: new Date(),
        lastError: null,
        updatedAt: new Date(),
      })
      .where(eq(syncJobs.id, job.id));
    return {
      processed: true,
      status: "completed",
      jobId: job.id,
      netboxRunId,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Synchronization failed";
    const dead = job.attempts >= 5;
    await db
      .update(syncJobs)
      .set({
        status: dead ? "dead" : "pending",
        lastError: message,
        availableAt: new Date(
          Date.now() + Math.min(300, 2 ** job.attempts * 5) * 1000,
        ),
        finishedAt: dead ? new Date() : null,
        updatedAt: new Date(),
      })
      .where(eq(syncJobs.id, job.id));
    return {
      processed: true,
      status: dead ? "dead" : "pending",
      jobId: job.id,
      error: message,
    };
  }
}
export async function jobStatus() {
  const jobs = await db
    .select()
    .from(syncJobs)
    .orderBy(desc(syncJobs.createdAt))
    .limit(50);
  return { sourceMode: sourceMode(), jobs };
}
