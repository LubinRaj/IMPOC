import type { Provider } from "@/lib/contracts";

export async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...options,
    headers: { "Content-Type": "application/json", ...options?.headers },
  });
  const value = await res.json();
  if (res.status === 401 && typeof window !== "undefined")
    window.dispatchEvent(new Event("impoc:session-expired"));
  if (!res.ok)
    throw new Error(value.error?.message ?? `Request failed (${res.status})`);
  return value as T;
}
export const body = (
  method: "POST" | "PATCH" | "DELETE",
  value?: unknown,
): RequestInit => ({
  method,
  body: value === undefined ? undefined : JSON.stringify(value),
});
export type Scope = {
  id: string;
  provider: Provider;
  name: string;
  environment: string;
  simulationMode: "ok" | "partial" | "failed";
  sourceCount: number;
  inventoryCount?: number | null;
  sourceRevision: number;
  inventoryRevision: number;
};
export type Source = {
  id: string;
  scopeId: string;
  scopeName: string;
  provider: string;
  externalId: string;
  nativePayload: Record<string, unknown>;
  normalized: {
    hostname: string;
    ipAddresses: string[];
    operatingSystem: string | null;
    cpuCores: number | null;
    memoryMB: number | null;
    diskGB: number | null;
    powerState: string;
    region: string | null;
    cluster: string | null;
    owner: string | null;
    tags: Record<string, string>;
  };
};
export type Inventory = {
  id: string;
  scopeId: string;
  scopeName: string;
  provider: string;
  externalId: string;
  hostname: string;
  ipAddresses: string[];
  operatingSystem: string | null;
  cpuCores: number | null;
  memoryMB: number | null;
  diskGB: number | null;
  powerState: string;
  region: string | null;
  cluster: string | null;
  owner: string | null;
  tags: Record<string, string>;
  lifecycleStatus: string;
  consecutiveMissingScans: number;
  lastSeenAt: string | null;
};
export type Paged<T> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
};
export type Change = {
  kind: string;
  scopeId: string;
  provider: string;
  externalId: string;
  fields: { field: string; before: unknown; after: unknown }[];
  before: unknown;
  after: unknown;
};
export type Preview = {
  planId: string;
  destination?: "local" | "netbox";
  expiresAt: string;
  summary: Record<string, number>;
  scopes: {
    scopeId: string;
    provider: string;
    collectionStatus: string;
    error: string | null;
    changes: Change[];
  }[];
};
export type Run = {
  id: string;
  destination: "local" | "netbox";
  status: string;
  counts: Record<string, number>;
  startedAt: string;
  finishedAt: string;
};
export function fmt(value: string | null | undefined) {
  return value ? new Date(value).toLocaleString() : "—";
}
export function countLabel(n: number) {
  return `${n} VM${n === 1 ? "" : "s"}`;
}
