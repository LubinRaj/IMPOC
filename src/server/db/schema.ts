import {
  pgTable,
  uuid,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
  uniqueIndex,
  index,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import type { CanonicalVm, PlannedChange, Provider } from "@/lib/contracts";
const time = {
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
};
export const scopes = pgTable(
  "provider_scopes",
  {
    id: uuid("id").primaryKey(),
    provider: text("provider").$type<Provider>().notNull(),
    name: text("name").notNull(),
    environment: text("environment").notNull(),
    enabled: boolean("enabled").default(true).notNull(),
    sourceRevision: integer("source_revision").default(0).notNull(),
    inventoryRevision: integer("inventory_revision").default(0).notNull(),
    simulationMode: text("simulation_mode")
      .$type<"ok" | "partial" | "failed">()
      .default("ok")
      .notNull(),
    ...time,
  },
  (t) => [
    check(
      "provider_valid",
      sql`${t.provider} in ('aws','azure','gcp','vmware','proxmox')`,
    ),
    check("mode_valid", sql`${t.simulationMode} in ('ok','partial','failed')`),
  ],
);
export const sources = pgTable(
  "simulated_source_vms",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    scopeId: uuid("scope_id")
      .references(() => scopes.id)
      .notNull(),
    externalId: text("external_id").notNull(),
    nativePayload: jsonb("native_payload")
      .$type<Record<string, unknown>>()
      .notNull(),
    ...time,
  },
  (t) => [
    uniqueIndex("source_identity").on(t.scopeId, t.externalId),
    check("source_external_id_nonempty", sql`length(${t.externalId})>0`),
  ],
);
export const inventory = pgTable(
  "inventory_vms",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    scopeId: uuid("scope_id")
      .references(() => scopes.id)
      .notNull(),
    externalId: text("external_id").notNull(),
    canonical: jsonb("canonical").$type<CanonicalVm>().notNull(),
    lifecycleStatus: text("lifecycle_status")
      .$type<"active" | "orphaned" | "decommissioned">()
      .default("active")
      .notNull(),
    consecutiveMissingScans: integer("consecutive_missing_scans")
      .default(0)
      .notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
    ...time,
  },
  (t) => [
    uniqueIndex("inventory_identity").on(t.scopeId, t.externalId),
    check(
      "inventory_status_valid",
      sql`${t.lifecycleStatus} in ('active','orphaned','decommissioned')`,
    ),
    check(
      "inventory_missing_nonnegative",
      sql`${t.consecutiveMissingScans}>=0`,
    ),
  ],
);
export type StoredScopePlan = {
  scopeId: string;
  provider: Provider;
  collectionStatus: "complete" | "partial" | "failed";
  error: string | null;
  sourceRevision: number;
  inventoryRevision: number;
  sourceMode?: "simulation" | "live";
  sourceFingerprint?: string;
  destinationFingerprint?: string;
  changes: PlannedChange[];
};
export const plans = pgTable("sync_plans", {
  id: uuid("id").primaryKey().defaultRandom(),
  destination: text("destination")
    .$type<"local" | "netbox">()
    .default("netbox")
    .notNull(),
  scopePlans: jsonb("scope_plans").$type<StoredScopePlan[]>().notNull(),
  status: text("status")
    .$type<"previewed" | "applied" | "stale" | "expired">()
    .default("previewed")
    .notNull(),
  runId: uuid("run_id"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  ...time,
});
export const runs = pgTable(
  "sync_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    planId: uuid("plan_id")
      .references(() => plans.id)
      .notNull(),
    destination: text("destination")
      .$type<"local" | "netbox">()
      .default("netbox")
      .notNull(),
    status: text("status")
      .$type<"completed" | "partial" | "failed">()
      .notNull(),
    counts: jsonb("counts").$type<Record<string, number>>().notNull(),
    startedAt: timestamp("started_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    finishedAt: timestamp("finished_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [index("runs_started").on(t.startedAt)],
);
export const runScopes = pgTable("sync_run_scopes", {
  id: uuid("id").primaryKey().defaultRandom(),
  runId: uuid("run_id")
    .references(() => runs.id)
    .notNull(),
  scopeId: uuid("scope_id")
    .references(() => scopes.id)
    .notNull(),
  collectionStatus: text("collection_status").notNull(),
  resultStatus: text("result_status").notNull(),
  error: text("error"),
  counts: jsonb("counts").$type<Record<string, number>>().notNull(),
});
export const changes = pgTable("sync_changes", {
  id: uuid("id").primaryKey().defaultRandom(),
  runId: uuid("run_id")
    .references(() => runs.id)
    .notNull(),
  scopeId: uuid("scope_id")
    .references(() => scopes.id)
    .notNull(),
  externalId: text("external_id").notNull(),
  kind: text("kind").notNull(),
  fields: jsonb("fields").notNull(),
  result: text("result").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});
export const syncJobs = pgTable(
  "sync_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    scopeId: uuid("scope_id")
      .references(() => scopes.id)
      .notNull(),
    eventKey: text("event_key").notNull(),
    trigger: text("trigger")
      .$type<"source_change" | "event" | "poll">()
      .notNull(),
    status: text("status")
      .$type<"pending" | "running" | "completed" | "dead">()
      .default("pending")
      .notNull(),
    attempts: integer("attempts").default(0).notNull(),
    availableAt: timestamp("available_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    lastError: text("last_error"),
    localRunId: uuid("local_run_id"),
    netboxRunId: uuid("netbox_run_id"),
    ...time,
  },
  (t) => [
    uniqueIndex("sync_job_event_unique").on(t.scopeId, t.eventKey),
    index("sync_job_pending").on(t.status, t.availableAt),
    check("sync_job_trigger_valid", sql`${t.trigger} in ('source_change','event','poll')`),
    check("sync_job_status_valid", sql`${t.status} in ('pending','running','completed','dead')`),
    check("sync_job_attempts_nonnegative", sql`${t.attempts}>=0`),
  ],
);
