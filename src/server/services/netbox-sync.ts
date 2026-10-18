import "server-only";
import { eq, sql } from "drizzle-orm";
import { db, pool } from "../db/client";
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
import { NetBoxDestination } from "../destinations/netbox";
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
const counts = (items: PlannedChange[]) =>
  Object.fromEntries(
    kinds.map((kind) => [
      kind,
      items.filter((item) => item.kind === kind).length,
    ]),
  ) as Record<ChangeKind, number>;

export async function previewNetBox(requested?: string[]) {
  const destination = new NetBoxDestination();
  const remote = await destination.listAll();
  return db.transaction(async (tx) => {
    const ids = requested?.length
      ? requested
      : (
          await tx
            .select({ id: scopes.id })
            .from(scopes)
            .where(eq(scopes.enabled, true))
        ).map((x) => x.id);
    const selected = [...new Set(ids)].sort();
    if (!selected.length)
      throw new AppError("NO_SCOPES", "Select at least one scope.", 400);
    const scopePlans: StoredScopePlan[] = [];
    for (const id of selected) {
      await tx.execute(
        sql`select id from provider_scopes where id=${id} for share`,
      );
      const [scope] = await tx.select().from(scopes).where(eq(scopes.id, id));
      if (!scope || !scope.enabled)
        throw new AppError("NOT_FOUND", `Enabled scope ${id} not found`, 404);
      const target = remote.filter((vm) => vm.scopeId === id);
      const base = {
        scopeId: id,
        provider: scope.provider,
        sourceMode: sourceMode(),
        sourceRevision: scope.sourceRevision,
        inventoryRevision: scope.inventoryRevision,
        destinationFingerprint: destination.fingerprint(target),
      };
      if (sourceMode() === "simulation" && scope.simulationMode !== "ok") {
        scopePlans.push({
          ...base,
          collectionStatus: scope.simulationMode,
          error:
            scope.simulationMode === "failed"
              ? "Simulated provider outage"
              : "Simulated partial collection; scope skipped",
          changes: [],
        });
        continue;
      }
      try {
        const raw =
          sourceMode() === "live"
            ? await collectLive(scope)
            : await tx.select().from(sources).where(eq(sources.scopeId, id));
        const normalized = raw.map((row) =>
          normalize(scope.provider, id, row.nativePayload),
        );
        const identities = new Set<string>();
        for (let i = 0; i < raw.length; i++) {
          if (
            raw[i].externalId !== normalized[i].externalId ||
            identities.has(normalized[i].externalId)
          )
            throw new Error("Invalid or duplicate native identity");
          identities.add(normalized[i].externalId);
        }
        scopePlans.push({
          ...base,
          collectionStatus: "complete",
          error: null,
          sourceFingerprint:
            sourceMode() === "live" ? sourceFingerprint(normalized) : undefined,
          changes: planChanges(normalized, target),
        });
      } catch (error) {
        scopePlans.push({
          ...base,
          collectionStatus: "failed",
          error:
            error instanceof Error
              ? `Invalid provider snapshot: ${error.message}`
              : "Invalid provider snapshot",
          changes: [],
        });
      }
    }
    const [plan] = await tx
      .insert(plans)
      .values({
        destination: "netbox",
        scopePlans,
        expiresAt: new Date(Date.now() + 10 * 60_000),
      })
      .returning();
    return {
      planId: plan.id,
      destination: "netbox" as const,
      expiresAt: plan.expiresAt.toISOString(),
      summary: counts(scopePlans.flatMap((scope) => scope.changes)),
      scopes: scopePlans,
    };
  });
}

export async function applyNetBox(planId: string) {
  const lock = await pool.connect();
  try {
    await lock.query("BEGIN");
    await lock.query(
      "SELECT pg_advisory_xact_lock(hashtext('impoc-netbox-global'), 0)",
    );
    await lock.query(
      "SELECT pg_advisory_xact_lock(hashtext('impoc-netbox-plan'), hashtext($1))",
      [planId],
    );
    const [plan] = await db.select().from(plans).where(eq(plans.id, planId));
    if (!plan || plan.destination !== "netbox")
      throw new AppError("NOT_FOUND", "NetBox preview not found", 404);
    if (plan.status === "applied" && plan.runId)
      return { runId: plan.runId, replayed: true };
    if (plan.status !== "previewed" || plan.expiresAt < new Date())
      throw new AppError(
        "REPREVIEW_REQUIRED",
        "Preview expired or is no longer valid. Preview again.",
        409,
      );
    for (const scope of [...plan.scopePlans].sort((a, b) =>
      a.scopeId.localeCompare(b.scopeId),
    ))
      await lock.query(
        "SELECT pg_advisory_xact_lock(hashtext('impoc-netbox-scope'), hashtext($1))",
        [scope.scopeId],
      );

    let destination: NetBoxDestination;
    let remote: Awaited<ReturnType<NetBoxDestination["listAll"]>>;
    try {
      destination = new NetBoxDestination();
      remote = await destination.listAll();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "NetBox is unavailable.";
      const [run] = await db
        .insert(runs)
        .values({
          planId,
          destination: "netbox",
          status: "failed",
          counts: counts([]),
        })
        .returning();
      for (const scope of plan.scopePlans)
        await db
          .insert(runScopes)
          .values({
            runId: run.id,
            scopeId: scope.scopeId,
            collectionStatus: scope.collectionStatus,
            resultStatus: "failed",
            error: message,
            counts: counts([]),
          });
      await db
        .update(plans)
        .set({ status: "applied", runId: run.id, updatedAt: new Date() })
        .where(eq(plans.id, planId));
      return {
        runId: run.id,
        replayed: false,
        status: "failed" as const,
        counts: counts([]),
        skipped: plan.scopePlans.map((scope) => ({
          scopeId: scope.scopeId,
          error: message,
        })),
      };
    }
    for (const scopePlan of plan.scopePlans) {
      const [scope] = await db
        .select()
        .from(scopes)
        .where(eq(scopes.id, scopePlan.scopeId));
      if (
        !scope ||
        scope.sourceRevision !== scopePlan.sourceRevision ||
        (scopePlan.sourceMode && scopePlan.sourceMode !== sourceMode())
      )
        throw new AppError(
          "REPREVIEW_REQUIRED",
          "Source changed. Preview again.",
          409,
        );
      if (
        scopePlan.collectionStatus === "complete" &&
        scopePlan.sourceFingerprint
      ) {
        const raw = await collectLive(scope);
        const fingerprint = sourceFingerprint(
          raw.map((r) => normalize(scope.provider, scope.id, r.nativePayload)),
        );
        if (fingerprint !== scopePlan.sourceFingerprint)
          throw new AppError(
            "REPREVIEW_REQUIRED",
            "Live source changed. Preview again.",
            409,
          );
      }
      if (
        destination.fingerprint(
          remote.filter((vm) => vm.scopeId === scopePlan.scopeId),
        ) !== scopePlan.destinationFingerprint
      )
        throw new AppError(
          "REPREVIEW_REQUIRED",
          "NetBox inventory changed. Preview again.",
          409,
        );
    }

    const [run] = await db
      .insert(runs)
      .values({
        planId,
        destination: "netbox",
        status: "failed",
        counts: counts([]),
      })
      .returning();
    const applied: PlannedChange[] = [];
    let succeeded = 0,
      failed = 0;
    for (const scopePlan of plan.scopePlans) {
      if (scopePlan.collectionStatus !== "complete") {
        failed++;
        await db
          .insert(runScopes)
          .values({
            runId: run.id,
            scopeId: scopePlan.scopeId,
            collectionStatus: scopePlan.collectionStatus,
            resultStatus: "skipped",
            error: scopePlan.error,
            counts: counts([]),
          });
        continue;
      }
      const scopeApplied: PlannedChange[] = [];
      let errorMessage: string | null = null;
      try {
        await destination.ensureCustomField();
        for (const change of scopePlan.changes) {
          const [scope] = await db
            .select({ sourceRevision: scopes.sourceRevision })
            .from(scopes)
            .where(eq(scopes.id, scopePlan.scopeId));
          if (!scope || scope.sourceRevision !== scopePlan.sourceRevision)
            throw new AppError(
              "REPREVIEW_REQUIRED",
              "Source changed during NetBox apply. Preview again.",
              409,
            );
          await destination.applyChange(change, new Date());
          scopeApplied.push(change);
          if (change.kind !== "NO_CHANGE")
            await db
              .insert(changes)
              .values({
                runId: run.id,
                scopeId: scopePlan.scopeId,
                externalId: change.externalId,
                kind: change.kind,
                fields: change.fields,
                result: "applied",
              });
        }
      } catch (error) {
        errorMessage =
          error instanceof Error
            ? error.message
            : "NetBox synchronization failed.";
      }
      applied.push(...scopeApplied);
      if (errorMessage) failed++;
      else succeeded++;
      await db
        .insert(runScopes)
        .values({
          runId: run.id,
          scopeId: scopePlan.scopeId,
          collectionStatus: scopePlan.collectionStatus,
          resultStatus: errorMessage ? "failed" : "applied",
          error: errorMessage,
          counts: counts(scopeApplied),
        });
    }
    const status =
      failed === 0
        ? "completed"
        : succeeded || applied.length
          ? "partial"
          : "failed";
    const summary = counts(applied);
    await db
      .update(runs)
      .set({ status, counts: summary, finishedAt: new Date() })
      .where(eq(runs.id, run.id));
    await db
      .update(plans)
      .set({ status: "applied", runId: run.id, updatedAt: new Date() })
      .where(eq(plans.id, planId));
    return {
      runId: run.id,
      replayed: false,
      status,
      counts: summary,
      skipped: failed
        ? (await db.select().from(runScopes).where(eq(runScopes.runId, run.id)))
            .filter((item) => item.resultStatus !== "applied")
            .map((item) => ({ scopeId: item.scopeId, error: item.error }))
        : [],
    };
  } finally {
    await lock.query("ROLLBACK");
    lock.release();
  }
}
