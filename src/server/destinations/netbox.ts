import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import { canonical } from "../collectors/native";
import { planChanges } from "../reconciliation";
import { AppError } from "../services/errors";
import {
  providerSchema,
  vmInputSchema,
  type CanonicalVm,
  type InventoryVm,
  type PlannedChange,
} from "@/lib/contracts";
import type { InventoryDestination } from "./destination";

type NetBoxVm = {
  id: number;
  name: string;
  status: { value: string } | string;
  vcpus: number | null;
  memory: number | null;
  disk: number | null;
  created: string;
  last_updated: string;
  custom_fields: { impoc_record?: ManagedMeta | null };
};
type ManagedMeta = {
  scopeId: string;
  externalId: string;
  canonical: CanonicalVm;
  lifecycleStatus: "active" | "orphaned" | "decommissioned";
  consecutiveMissingScans: number;
  lastSeenAt: string | null;
};
const managedSchema = z.object({
  scopeId: z.string().uuid(),
  externalId: z.string().min(1),
  canonical: vmInputSchema.extend({ provider: providerSchema }),
  lifecycleStatus: z.enum(["active", "orphaned", "decommissioned"]),
  consecutiveMissingScans: z.number().int().nonnegative(),
  lastSeenAt: z.string().datetime().nullable(),
});
type Paged<T> = { count: number; next: string | null; results: T[] };

export class NetBoxClient {
  readonly base: URL;
  private token: string;
  constructor() {
    if (!process.env.NETBOX_URL || !process.env.NETBOX_API_TOKEN)
      throw new AppError(
        "NETBOX_NOT_CONFIGURED",
        "NetBox is not configured. Run scripts/setup-netbox.sh and restart the app.",
        503,
      );
    this.base = new URL(process.env.NETBOX_URL);
    if (
      this.base.protocol !== "http:" ||
      !["localhost", "127.0.0.1"].includes(this.base.hostname)
    )
      throw new AppError(
        "NETBOX_URL_INVALID",
        "NetBox URL must use local HTTP on localhost or 127.0.0.1.",
        503,
      );
    this.token = process.env.NETBOX_API_TOKEN;
  }
  async request<T>(path: string, method = "GET", body?: unknown): Promise<T> {
    const url = new URL(path, this.base);
    if (url.origin !== this.base.origin || !url.pathname.startsWith("/api/"))
      throw new AppError(
        "NETBOX_URL_INVALID",
        "NetBox API path is invalid.",
        500,
      );
    let response: Response;
    try {
      response = await fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${this.token}`,
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        cache: "no-store",
        signal: AbortSignal.timeout(12000),
      });
    } catch {
      throw new AppError(
        "NETBOX_UNAVAILABLE",
        "NetBox is unreachable. Inventory cannot be read or synchronized until it recovers.",
        503,
      );
    }
    const text = await response.text();
    let data: unknown;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text.slice(0, 300);
    }
    if (!response.ok) {
      const detail =
        typeof data === "object" && data !== null
          ? JSON.stringify(data).slice(0, 500)
          : String(data).slice(0, 300);
      throw new AppError(
        "NETBOX_API_ERROR",
        `NetBox ${method} ${url.pathname} failed (${response.status}): ${detail}`,
        response.status === 401 || response.status === 403 ? 502 : 503,
      );
    }
    return data as T;
  }
  async list<T>(path: string): Promise<T[]> {
    const values: T[] = [];
    let next: string | null = path;
    for (let page = 0; next && page < 100; page++) {
      const data: Paged<T> = await this.request<Paged<T>>(next);
      values.push(...data.results);
      next = data.next;
    }
    if (next)
      throw new AppError(
        "NETBOX_TOO_MANY_RECORDS",
        "NetBox inventory exceeds the supported page limit.",
        503,
      );
    return values;
  }
  async health() {
    return this.request<{ "netbox-version": string }>("/api/status/");
  }
}

function statusValue(vm: NetBoxVm) {
  return typeof vm.status === "string" ? vm.status : vm.status.value;
}
function toInventory(vm: NetBoxVm): InventoryVm | null {
  const raw = vm.custom_fields?.impoc_record;
  if (!raw) return null;
  const parsed = managedSchema.safeParse(raw);
  if (
    !parsed.success ||
    parsed.data.scopeId !== parsed.data.canonical.scopeId ||
    parsed.data.externalId !== parsed.data.canonical.externalId
  )
    throw new AppError(
      "NETBOX_INVALID_RECORD",
      `Managed NetBox VM ${vm.id} has invalid identity metadata.`,
      503,
    );
  const meta = parsed.data;
  const state = statusValue(vm);
  const source = meta.canonical;
  return {
    ...canonical({
      ...source,
      hostname: vm.name,
      cpuCores: vm.vcpus,
      memoryMB: vm.memory,
      diskGB: vm.disk === null ? null : vm.disk / 1024,
      powerState:
        meta.lifecycleStatus !== "active"
          ? "unknown"
          : state === "active"
            ? "running"
            : state === "offline" && source.powerState === "running"
              ? "stopped"
              : source.powerState,
    }),
    id: String(vm.id),
    lifecycleStatus: meta.lifecycleStatus,
    consecutiveMissingScans: meta.consecutiveMissingScans,
    lastSeenAt: meta.lastSeenAt,
    createdAt: vm.created,
    updatedAt: vm.last_updated,
  };
}
function netboxStatus(c: PlannedChange) {
  if (c.kind === "MARK_ORPHAN") return "offline";
  if (c.kind === "DECOMMISSION") return "decommissioning";
  return c.after?.powerState === "running" ? "active" : "offline";
}
function metadata(c: PlannedChange, now: Date): ManagedMeta {
  const original = c.after ?? c.before;
  if (!original)
    throw new AppError("INVALID_PLAN", "Planned change has no VM.", 422);
  return {
    scopeId: c.scopeId,
    externalId: c.externalId,
    canonical: canonical(original),
    lifecycleStatus:
      c.kind === "MARK_ORPHAN"
        ? "orphaned"
        : c.kind === "DECOMMISSION"
          ? "decommissioned"
          : "active",
    consecutiveMissingScans:
      c.kind === "MARK_ORPHAN" ? 1 : c.kind === "DECOMMISSION" ? 2 : 0,
    lastSeenAt: c.after ? now.toISOString() : (c.before?.lastSeenAt ?? null),
  };
}

export class NetBoxDestination implements InventoryDestination {
  constructor(readonly client = new NetBoxClient()) {}
  async listAll(): Promise<InventoryVm[]> {
    const records = await this.client.list<NetBoxVm>(
      "/api/virtualization/virtual-machines/?limit=100",
    );
    const seen = new Set<string>();
    return records.flatMap((record) => {
      const vm = toInventory(record);
      if (!vm) return [];
      const identity = `${vm.scopeId}\u0000${vm.externalId}`;
      if (seen.has(identity))
        throw new AppError(
          "NETBOX_DUPLICATE_ID",
          `Duplicate managed NetBox identity ${vm.externalId} in scope ${vm.scopeId}.`,
          409,
        );
      seen.add(identity);
      return [vm];
    });
  }
  async listByScope(scopeId: string) {
    return (await this.listAll()).filter((vm) => vm.scopeId === scopeId);
  }
  fingerprint(records: InventoryVm[]) {
    return createHash("sha256")
      .update(
        JSON.stringify(
          records
            .map((vm) => ({
              id: vm.id,
              fields: Object.fromEntries(
                Object.entries(vm).filter(
                  ([key]) =>
                    !["updatedAt", "createdAt", "lastSeenAt"].includes(key),
                ),
              ),
            }))
            .sort((a, b) => a.id.localeCompare(b.id)),
        ),
      )
      .digest("hex");
  }
  private async ensureCluster(scopeId: string) {
    const types = await this.client.list<{ id: number; slug: string }>(
      "/api/virtualization/cluster-types/?limit=100",
    );
    let type = types.find((item) => item.slug === "impoc-simulated");
    if (!type)
      type = await this.client.request<{ id: number; slug: string }>(
        "/api/virtualization/cluster-types/",
        "POST",
        { name: "IMPOC simulated providers", slug: "impoc-simulated" },
      );
    const name = `IMPOC ${scopeId}`;
    const clusters = await this.client.list<{ id: number; name: string }>(
      `/api/virtualization/clusters/?limit=100&name=${encodeURIComponent(name)}`,
    );
    let cluster = clusters.find((item) => item.name === name);
    if (!cluster)
      cluster = await this.client.request<{ id: number; name: string }>(
        "/api/virtualization/clusters/",
        "POST",
        { name, type: type.id, status: "active" },
      );
    return cluster.id;
  }
  async ensureCustomField() {
    const fields = await this.client.list<{
      id: number;
      name: string;
      type: { value: string } | string;
      object_types: string[];
    }>("/api/extras/custom-fields/?limit=100");
    const existing = fields.find((field) => field.name === "impoc_record");
    if (
      existing &&
      ((typeof existing.type === "string"
        ? existing.type
        : existing.type.value) !== "json" ||
        !existing.object_types.includes("virtualization.virtualmachine"))
    )
      throw new AppError(
        "NETBOX_SCHEMA_CONFLICT",
        "NetBox custom field impoc_record must be JSON and attached to virtual machines.",
        503,
      );
    if (!existing)
      await this.client.request("/api/extras/custom-fields/", "POST", {
        object_types: ["virtualization.virtualmachine"],
        type: "json",
        name: "impoc_record",
        label: "IMPOC source and lifecycle",
        required: false,
      });
  }
  async applyChange(c: PlannedChange, now: Date) {
    if (c.kind === "NO_CHANGE") {
      if (c.after && c.before) {
        const meta = metadata(c, now);
        await this.client.request(
          `/api/virtualization/virtual-machines/${c.before.id}/`,
          "PATCH",
          { custom_fields: { impoc_record: meta } },
        );
      }
      return;
    }
    const existing = (await this.listByScope(c.scopeId)).find(
      (vm) => vm.externalId === c.externalId,
    );
    if (c.kind === "CREATE" && existing)
      throw new AppError(
        "REPREVIEW_REQUIRED",
        "VM appeared in NetBox after preview. Preview again.",
        409,
      );
    if (c.kind !== "CREATE" && !existing)
      throw new AppError(
        "REPREVIEW_REQUIRED",
        "VM disappeared from NetBox after preview. Preview again.",
        409,
      );
    const meta = metadata(c, now);
    const body = {
      name: meta.canonical.hostname,
      status: netboxStatus(c),
      vcpus: meta.canonical.cpuCores,
      memory: meta.canonical.memoryMB,
      disk:
        meta.canonical.diskGB === null ? null : meta.canonical.diskGB * 1024,
      custom_fields: { impoc_record: meta },
    };
    if (c.kind === "CREATE") {
      const cluster = await this.ensureCluster(c.scopeId);
      await this.client.request(
        "/api/virtualization/virtual-machines/",
        "POST",
        { ...body, cluster },
      );
    } else {
      await this.client.request(
        `/api/virtualization/virtual-machines/${existing!.id}/`,
        "PATCH",
        body,
      );
    }
    const updated = (await this.listByScope(c.scopeId)).find(
      (vm) => vm.externalId === c.externalId,
    );
    if (!updated)
      throw new AppError(
        "NETBOX_READBACK_FAILED",
        `NetBox did not return VM ${c.externalId} after writing it.`,
        503,
      );
    if (c.after && planChanges([c.after], [updated])[0]?.kind !== "NO_CHANGE")
      throw new AppError(
        "NETBOX_READBACK_FAILED",
        `NetBox VM ${c.externalId} differs after writing it.`,
        503,
      );
    if (!c.after && updated.lifecycleStatus !== meta.lifecycleStatus)
      throw new AppError(
        "NETBOX_READBACK_FAILED",
        `NetBox VM ${c.externalId} has the wrong lifecycle after writing it.`,
        503,
      );
  }
}
