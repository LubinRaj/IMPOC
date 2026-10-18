import "server-only";
import { and, eq, ilike, or, sql, desc } from "drizzle-orm";
import { db } from "../db/client";
import { scopes, sources, inventory, runs, syncJobs } from "../db/schema";
import { normalize, toNative } from "../collectors/native";
import { collectLive, sourceMode } from "../collectors/live";
import { NetBoxDestination } from "../destinations/netbox";
import { AppError } from "./errors";
import type { VmInput } from "@/lib/contracts";
export async function listScopes() {
  const rows = await db
    .select()
    .from(scopes)
    .orderBy(scopes.provider, scopes.name);
  const src = await db
    .select({ scopeId: sources.scopeId, count: sql<number>`count(*)::int` })
    .from(sources)
    .groupBy(sources.scopeId);
  return rows.map((r) => ({
    ...r,
    sourceCount: src.find((x) => x.scopeId === r.id)?.count ?? 0,
  }));
}
export async function setMode(id: string, mode: "ok" | "partial" | "failed") {
  if (sourceMode() === "live")
    throw new AppError(
      "LIVE_READ_ONLY",
      "Simulation controls are unavailable in live mode",
      409,
    );
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select id from provider_scopes where id=${id} for update`,
    );
    const [r] = await tx
      .update(scopes)
      .set({
        simulationMode: mode,
        sourceRevision: sql`${scopes.sourceRevision}+1`,
        updatedAt: new Date(),
      })
      .where(eq(scopes.id, id))
      .returning();
    if (!r) throw new AppError("NOT_FOUND", "Scope not found", 404);
    if (mode === "ok")
      await tx
        .insert(syncJobs)
        .values({
          scopeId: id,
          eventKey: `source:${r.sourceRevision}`,
          trigger: "source_change",
        })
        .onConflictDoNothing();
    return r;
  });
}
export async function listSource(opts: {
  scopeId?: string;
  q?: string;
  page: number;
  pageSize: number;
}) {
  if (sourceMode() === "live") {
    const selected = await db
      .select()
      .from(scopes)
      .where(
        opts.scopeId ? eq(scopes.id, opts.scopeId) : eq(scopes.enabled, true),
      );
    const items = (
      await Promise.all(
        selected.map(async (scope) => {
          try {
            return (await collectLive(scope)).map((row) => ({
              ...row,
              id: `live:${scope.id}:${row.externalId}`,
              scopeId: scope.id,
              provider: scope.provider,
              scopeName: scope.name,
              normalized: normalize(
                scope.provider,
                scope.id,
                row.nativePayload,
              ),
              createdAt: null,
              updatedAt: null,
            }));
          } catch (error) {
            throw new AppError(
              "LIVE_COLLECTION_FAILED",
              `${scope.name}: ${error instanceof Error ? error.message : "collection failed"}`,
              503,
            );
          }
        }),
      )
    ).flat();
    const filtered = opts.q
      ? items.filter((item) =>
          JSON.stringify(item).toLowerCase().includes(opts.q!.toLowerCase()),
        )
      : items;
    return {
      items: filtered.slice(
        (opts.page - 1) * opts.pageSize,
        opts.page * opts.pageSize,
      ),
      total: filtered.length,
      page: opts.page,
      pageSize: opts.pageSize,
    };
  }
  const where = and(
    opts.scopeId ? eq(sources.scopeId, opts.scopeId) : undefined,
    opts.q
      ? or(
          ilike(sources.externalId, `%${opts.q}%`),
          sql`${sources.nativePayload}::text ilike ${`%${opts.q}%`}`,
        )
      : undefined,
  );
  const rows = await db
    .select({ source: sources, scope: scopes })
    .from(sources)
    .innerJoin(scopes, eq(sources.scopeId, scopes.id))
    .where(where)
    .orderBy(scopes.provider, sources.externalId)
    .limit(opts.pageSize)
    .offset((opts.page - 1) * opts.pageSize);
  const [c] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(sources)
    .where(where);
  return {
    items: rows.map(({ source, scope }) => ({
      ...source,
      provider: scope.provider,
      scopeName: scope.name,
      normalized: normalize(scope.provider, scope.id, source.nativePayload),
    })),
    total: c.count,
    page: opts.page,
    pageSize: opts.pageSize,
  };
}
export async function createSource(input: VmInput) {
  return db.transaction(async (tx) => {
    if (sourceMode() === "live")
      throw new AppError(
        "LIVE_READ_ONLY",
        "Live cloud inventory is read-only",
        409,
      );
    await tx.execute(
      sql`select id from provider_scopes where id=${input.scopeId} for update`,
    );
    const [scope] = await tx
      .select()
      .from(scopes)
      .where(eq(scopes.id, input.scopeId));
    if (!scope) throw new AppError("NOT_FOUND", "Scope not found", 404);
    const payload = toNative(scope.provider, input);
    const [row] = await tx
      .insert(sources)
      .values({
        scopeId: scope.id,
        externalId: input.externalId,
        nativePayload: payload,
      })
      .returning();
    const [updated] = await tx
      .update(scopes)
      .set({
        sourceRevision: sql`${scopes.sourceRevision}+1`,
        updatedAt: new Date(),
      })
      .where(eq(scopes.id, scope.id))
      .returning();
    await tx.insert(syncJobs).values({
      scopeId: scope.id,
      eventKey: `source:${updated.sourceRevision}`,
      trigger: "source_change",
    });
    return row;
  });
}
export async function patchSource(
  id: string,
  patch: Partial<Omit<VmInput, "scopeId" | "externalId">>,
) {
  return db.transaction(async (tx) => {
    if (sourceMode() === "live")
      throw new AppError(
        "LIVE_READ_ONLY",
        "Live cloud inventory is read-only",
        409,
      );
    const [existing] = await tx
      .select()
      .from(sources)
      .where(eq(sources.id, id));
    if (!existing) throw new AppError("NOT_FOUND", "Source VM not found", 404);
    await tx.execute(
      sql`select id from provider_scopes where id=${existing.scopeId} for update`,
    );
    const [scope] = await tx
      .select()
      .from(scopes)
      .where(eq(scopes.id, existing.scopeId));
    const [locked] = await tx.select().from(sources).where(eq(sources.id, id));
    if (!locked) throw new AppError("NOT_FOUND", "Source VM not found", 404);
    const current = normalize(scope.provider, scope.id, locked.nativePayload);
    const input = { ...current, ...patch };
    const payload = toNative(scope.provider, input);
    const [row] = await tx
      .update(sources)
      .set({ nativePayload: payload, updatedAt: new Date() })
      .where(eq(sources.id, id))
      .returning();
    const [updated] = await tx
      .update(scopes)
      .set({
        sourceRevision: sql`${scopes.sourceRevision}+1`,
        updatedAt: new Date(),
      })
      .where(eq(scopes.id, scope.id))
      .returning();
    await tx.insert(syncJobs).values({
      scopeId: scope.id,
      eventKey: `source:${updated.sourceRevision}`,
      trigger: "source_change",
    });
    return row;
  });
}
export async function deleteSource(id: string) {
  return db.transaction(async (tx) => {
    if (sourceMode() === "live")
      throw new AppError(
        "LIVE_READ_ONLY",
        "Live cloud inventory is read-only",
        409,
      );
    const [existing] = await tx
      .select()
      .from(sources)
      .where(eq(sources.id, id));
    if (!existing) throw new AppError("NOT_FOUND", "Source VM not found", 404);
    await tx.execute(
      sql`select id from provider_scopes where id=${existing.scopeId} for update`,
    );
    const [locked] = await tx.select().from(sources).where(eq(sources.id, id));
    if (!locked) throw new AppError("NOT_FOUND", "Source VM not found", 404);
    await tx.delete(sources).where(eq(sources.id, id));
    const [updated] = await tx
      .update(scopes)
      .set({
        sourceRevision: sql`${scopes.sourceRevision}+1`,
        updatedAt: new Date(),
      })
      .where(eq(scopes.id, existing.scopeId))
      .returning();
    await tx.insert(syncJobs).values({
      scopeId: existing.scopeId,
      eventKey: `source:${updated.sourceRevision}`,
      trigger: "source_change",
    });
    return { deleted: true };
  });
}
export async function listInventory(opts: {
  scopeId?: string;
  q?: string;
  status?: "active" | "orphaned" | "decommissioned";
  page: number;
  pageSize: number;
}) {
  const where = and(
    opts.scopeId ? eq(inventory.scopeId, opts.scopeId) : undefined,
    opts.status ? eq(inventory.lifecycleStatus, opts.status) : undefined,
    opts.q
      ? or(
          ilike(inventory.externalId, `%${opts.q}%`),
          sql`${inventory.canonical}->>'hostname' ilike ${`%${opts.q}%`}`,
        )
      : undefined,
  );
  const rows = await db
    .select({ vm: inventory, scope: scopes })
    .from(inventory)
    .innerJoin(scopes, eq(inventory.scopeId, scopes.id))
    .where(where)
    .orderBy(scopes.provider, inventory.externalId)
    .limit(opts.pageSize)
    .offset((opts.page - 1) * opts.pageSize);
  const [c] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(inventory)
    .where(where);
  return {
    items: rows.map(({ vm, scope }) => ({
      ...vm.canonical,
      ...vm,
      id: vm.id,
      scopeName: scope.name,
    })),
    total: c.count,
    page: opts.page,
    pageSize: opts.pageSize,
  };
}
export async function dashboard() {
  const scopeRows = await listScopes();
  let remote: Awaited<ReturnType<NetBoxDestination["listAll"]>> | null = null;
  let netboxError: string | null = null;
  try {
    remote = await new NetBoxDestination().listAll();
  } catch (error) {
    netboxError =
      error instanceof Error ? error.message : "NetBox is unavailable.";
  }
  const latest = await db
    .select()
    .from(runs)
    .orderBy(desc(runs.startedAt))
    .limit(5);
  return {
    sourceMode: sourceMode(),
    netbox: {
      status: remote ? ("connected" as const) : ("unavailable" as const),
      error: netboxError,
    },
    scopes: scopeRows.map((scope) => ({
      ...scope,
      inventoryCount: remote
        ? remote.filter((vm) => vm.scopeId === scope.id).length
        : null,
    })),
    sourceCount:
      sourceMode() === "live"
        ? null
        : scopeRows.reduce((n, s) => n + s.sourceCount, 0),
    inventoryCount: remote?.length ?? null,
    lifecycle: remote
      ? {
          active: remote.filter((vm) => vm.lifecycleStatus === "active").length,
          orphaned: remote.filter((vm) => vm.lifecycleStatus === "orphaned")
            .length,
          decommissioned: remote.filter(
            (vm) => vm.lifecycleStatus === "decommissioned",
          ).length,
        }
      : null,
    latestRuns: latest,
  };
}
