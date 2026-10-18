import { z } from "zod";
export const providers = ["aws", "azure", "gcp", "vmware", "proxmox"] as const;
export const uuidSchema = z.string().uuid();
export const providerSchema = z.enum(providers);
export type Provider = z.infer<typeof providerSchema>;
export const vmInputSchema = z.object({
  scopeId: z.string().uuid(),
  externalId: z.string().trim().min(1).max(200),
  hostname: z.string().trim().min(1).max(200),
  ipAddresses: z.array(z.union([z.ipv4(), z.ipv6()])).default([]),
  operatingSystem: z.string().trim().max(100).nullable().default(null),
  cpuCores: z.number().int().positive().nullable().default(null),
  memoryMB: z.number().int().positive().nullable().default(null),
  diskGB: z.number().int().positive().nullable().default(null),
  powerState: z
    .enum(["running", "stopped", "suspended", "unknown"])
    .default("unknown"),
  region: z.string().max(100).nullable().default(null),
  cluster: z.string().max(100).nullable().default(null),
  owner: z.string().max(100).nullable().default(null),
  tags: z.record(z.string(), z.string()).default({}),
});
export type VmInput = z.infer<typeof vmInputSchema>;
export type CanonicalVm = Omit<VmInput, "scopeId"> & {
  provider: Provider;
  scopeId: string;
};
export type Lifecycle = "active" | "orphaned" | "decommissioned";
export type InventoryVm = CanonicalVm & {
  id: string;
  lifecycleStatus: Lifecycle;
  consecutiveMissingScans: number;
  lastSeenAt: string | null;
  createdAt: string;
  updatedAt: string;
};
export type FieldDiff = { field: string; before: unknown; after: unknown };
export type ChangeKind =
  | "CREATE"
  | "UPDATE"
  | "MARK_ORPHAN"
  | "DECOMMISSION"
  | "RESTORE"
  | "NO_CHANGE";
export type PlannedChange = {
  kind: ChangeKind;
  scopeId: string;
  provider: Provider;
  externalId: string;
  before: InventoryVm | null;
  after: CanonicalVm | null;
  fields: FieldDiff[];
};
export const previewRequestSchema = z.object({
  scopeIds: z.array(z.string().uuid()).min(1).optional(),
  destination: z.enum(["local", "netbox"]).default("netbox"),
});
export const applyRequestSchema = z.object({ planId: z.string().uuid() });
export const modeSchema = z.object({
  simulationMode: z.enum(["ok", "partial", "failed"]),
});
export const sourcePatchSchema = vmInputSchema
  .omit({ scopeId: true, externalId: true })
  .partial();
export const pageSchema = z.object({
  scopeId: z.string().uuid().optional(),
  q: z.string().max(100).optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  status: z.enum(["active", "orphaned", "decommissioned"]).optional(),
});
