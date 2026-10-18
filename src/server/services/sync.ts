import "server-only";
import { eq, desc, sql } from "drizzle-orm";
import { db } from "../db/client";
import {
  scopes,
  sources,
  plans,
  runs,
  runScopes,
  changes,
  type StoredScopePlan,
} from "../db/schema";
import { normalize } from "../collectors/native";
import { collectLive, sourceMode, sourceFingerprint } from "../collectors/live";
import { PostgresInventoryAdapter } from "../destinations/postgres";
import { planChanges } from "../reconciliation";
import { AppError } from "./errors";
import type { ChangeKind, PlannedChange } from "@/lib/contracts";
const kinds: ChangeKind[] = [
  "CREATE",
  "UPDATE",
  "MARK_ORPHAN",
  "DECOMMISSION",
  "RESTORE",
  "NO_CHANGE",
];
function counts(changes: PlannedChange[]) {
  return Object.fromEntries(
    kinds.map((kind) => [kind, changes.filter((c) => c.kind === kind).length]),
  ) as Record<ChangeKind, number>;
}
export async function preview(requested?: string[]) {
  return db.transaction(async (tx) => {
    const selected = requested?.length
      ? requested
      : [
          ...(await tx
            .select({ id: scopes.id })
            .from(scopes)
            .where(eq(scopes.enabled, true))),
        ].map((x) => x.id);
    const unique = [...new Set(selected)].sort();
    if (unique.length === 0)
      throw new AppError("NO_SCOPES", "Select at least one scope.", 400);
    for (const id of unique)
      await tx.execute(
        sql`select id from provider_scopes where id=${id} for share`,
      );
    const scopePlans: StoredScopePlan[] = [];
    const dest = new PostgresInventoryAdapter(tx);
    for (const id of unique) {
      const [scope] = await tx.select().from(scopes).where(eq(scopes.id, id));
      if (!scope || !scope.enabled)
        throw new AppError("NOT_FOUND", `Enabled scope ${id} not found`, 404);
      if (sourceMode() === "simulation" && scope.simulationMode !== "ok") {
        scopePlans.push({
          scopeId: id,
          provider: scope.provider,
          collectionStatus:
            scope.simulationMode === "failed" ? "failed" : "partial",
          error:
            scope.simulationMode === "failed"
              ? "Simulated provider outage"
              : "Simulated partial collection; scope skipped",
          sourceRevision: scope.sourceRevision,
          inventoryRevision: scope.inventoryRevision,
          sourceMode: sourceMode(),
          changes: [],
        });
        continue;
      }
      try {
        const raw =
          sourceMode() === "live"
            ? await collectLive(scope)
            : await tx.select().from(sources).where(eq(sources.scopeId, id));
        const normalized = raw.map((r) =>
          normalize(scope.provider, id, r.nativePayload),
        );
        const ids = new Set<string>();
        for (let i = 0; i < raw.length; i++) {
          if (
            raw[i].externalId !== normalized[i].externalId ||
            ids.has(normalized[i].externalId)
          )
            throw new Error("Invalid or duplicate native identity");
          ids.add(normalized[i].externalId);
        }
        const current = await dest.listByScope(id);
        const planned = planChanges(normalized, current);
        scopePlans.push({
          scopeId: id,
          provider: scope.provider,
          collectionStatus: "complete",
          error: null,
          sourceRevision: scope.sourceRevision,
          inventoryRevision: scope.inventoryRevision,
          sourceMode: sourceMode(),
          sourceFingerprint:
            sourceMode() === "live" ? sourceFingerprint(normalized) : undefined,
          changes: planned,
        });
      } catch (e) {
        scopePlans.push({
          scopeId: id,
          provider: scope.provider,
          collectionStatus: "failed",
          error:
            e instanceof Error
              ? `Invalid provider snapshot: ${e.message}`
              : "Invalid provider snapshot",
          sourceRevision: scope.sourceRevision,
          inventoryRevision: scope.inventoryRevision,
          sourceMode: sourceMode(),
          changes: [],
        });
      }
    }
    const [plan] = await tx
      .insert(plans)
      .values({
        destination: "local",
        scopePlans,
        expiresAt: new Date(Date.now() + 10 * 60_000),
      })
      .returning();
    const all = scopePlans.flatMap((s) => s.changes);
    return {
      planId: plan.id,
      expiresAt: plan.expiresAt.toISOString(),
      summary: counts(all),
      scopes: scopePlans,
    };
  });
}
export async function apply(planId: string) {
  try {
    return await db.transaction(async (tx) => {
      await tx.execute(
        sql`select id from sync_plans where id=${planId} for update`,
      );
      const [plan] = await tx.select().from(plans).where(eq(plans.id, planId));
      if (!plan) throw new AppError("NOT_FOUND", "Preview not found", 404);
      if (plan.destination !== "local")
        throw new AppError(
          "INVALID_DESTINATION",
          "This preview targets NetBox.",
          409,
        );
      if (plan.status === "applied" && plan.runId)
        return { runId: plan.runId, replayed: true };
      if (plan.status !== "previewed" || plan.expiresAt < new Date())
        throw new AppError(
          "REPREVIEW_REQUIRED",
          "Preview expired or is no longer valid. Preview again.",
          409,
        );
      for (const s of [...plan.scopePlans].sort((a, b) =>
        a.scopeId.localeCompare(b.scopeId),
      ))
        await tx.execute(
          sql`select id from provider_scopes where id=${s.scopeId} for update`,
        );
      for (const s of plan.scopePlans) {
        const [scope] = await tx
          .select()
          .from(scopes)
          .where(eq(scopes.id, s.scopeId));
        if (
          !scope ||
          scope.sourceRevision !== s.sourceRevision ||
          scope.inventoryRevision !== s.inventoryRevision ||
          (s.sourceMode && s.sourceMode !== sourceMode())
        )
          throw new AppError(
            "REPREVIEW_REQUIRED",
            "Source or inventory changed. Preview again.",
            409,
          );
        if (s.collectionStatus === "complete" && s.sourceFingerprint) {
          const raw = await collectLive(scope);
          const fingerprint = sourceFingerprint(
            raw.map((r) =>
              normalize(scope.provider, scope.id, r.nativePayload),
            ),
          );
          if (fingerprint !== s.sourceFingerprint)
            throw new AppError(
              "REPREVIEW_REQUIRED",
              "Live source changed. Preview again.",
              409,
            );
        }
      }
      const skipped = plan.scopePlans.filter(
        (s) => s.collectionStatus !== "complete",
      );
      const complete = plan.scopePlans.filter(
        (s) => s.collectionStatus === "complete",
      );
      const status =
        skipped.length === 0
          ? "completed"
          : complete.length === 0
            ? "failed"
            : "partial";
      const summary = counts(complete.flatMap((s) => s.changes));
      const [run] = await tx
        .insert(runs)
        .values({ planId, destination: "local", status, counts: summary })
        .returning();
      const now = new Date();
      const destination = new PostgresInventoryAdapter(tx);
      for (const s of plan.scopePlans) {
        const scopeCounts = counts(s.changes);
        await tx.insert(runScopes).values({
          runId: run.id,
          scopeId: s.scopeId,
          collectionStatus: s.collectionStatus,
          resultStatus:
            s.collectionStatus === "complete" ? "applied" : "skipped",
          error: s.error,
          counts: scopeCounts,
        });
        if (s.collectionStatus !== "complete") continue;
        for (const c of s.changes) {
          await destination.applyChange(c, now);
          if (c.kind !== "NO_CHANGE")
            await tx.insert(changes).values({
              runId: run.id,
              scopeId: s.scopeId,
              externalId: c.externalId,
              kind: c.kind,
              fields: c.fields,
              result: "applied",
            });
        }
        await tx
          .update(scopes)
          .set({
            inventoryRevision: sql`${scopes.inventoryRevision}+1`,
            updatedAt: now,
          })
          .where(eq(scopes.id, s.scopeId));
      }
      await tx
        .update(plans)
        .set({ status: "applied", runId: run.id, updatedAt: now })
        .where(eq(plans.id, planId));
      return {
        runId: run.id,
        replayed: false,
        status,
        counts: summary,
        skipped: skipped.map((s) => ({ scopeId: s.scopeId, error: s.error })),
      };
    });
  } catch (error) {
    if (error instanceof AppError) throw error;
    try {
      await db.transaction(async (tx) => {
        const [plan] = await tx
          .select()
          .from(plans)
          .where(eq(plans.id, planId));
        if (!plan) return;
        const [run] = await tx
          .insert(runs)
          .values({
            planId,
            destination: "local",
            status: "failed",
            counts: counts([]),
          })
          .returning();
        for (const s of plan.scopePlans)
          await tx.insert(runScopes).values({
            runId: run.id,
            scopeId: s.scopeId,
            collectionStatus: s.collectionStatus,
            resultStatus: "failed",
            error:
              "Destination apply failed; inventory transaction rolled back.",
            counts: counts([]),
          });
      });
    } catch (auditError) {
      console.error("Could not record failed apply", auditError);
    }
    throw error;
  }
}
export async function listRuns() {
  return db.select().from(runs).orderBy(desc(runs.startedAt)).limit(50);
}
export async function runDetail(id: string) {
  const [run] = await db.select().from(runs).where(eq(runs.id, id));
  if (!run) throw new AppError("NOT_FOUND", "Run not found", 404);
  const scopeRows = await db
    .select({ result: runScopes, scope: scopes })
    .from(runScopes)
    .innerJoin(scopes, eq(runScopes.scopeId, scopes.id))
    .where(eq(runScopes.runId, id));
  return {
    ...run,
    scopes: scopeRows.map(({ result, scope }) => ({
      ...result,
      scopeName: scope.name,
      provider: scope.provider,
    })),
    changes: await db.select().from(changes).where(eq(changes.runId, id)),
  };
}
