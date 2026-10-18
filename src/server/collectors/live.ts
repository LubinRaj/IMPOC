import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import type { CanonicalVm, Provider, VmInput } from "@/lib/contracts";
import { vmInputSchema } from "@/lib/contracts";
import { toNative } from "./native";

type Scope = { id: string; provider: Provider; environment: string };
const configSchema = z.record(
  z.string().uuid(),
  z.object({
    region: z.string().optional(),
    subscriptionId: z.string().optional(),
    projectId: z.string().optional(),
    url: z.url().optional(),
    node: z.string().optional(),
  }),
);
export function sourceMode(): "simulation" | "live" {
  const mode = process.env.SOURCE_MODE ?? "simulation";
  if (mode !== "simulation" && mode !== "live")
    throw new Error("SOURCE_MODE must be simulation or live");
  return mode;
}
export function sourceFingerprint(vms: CanonicalVm[]) {
  return createHash("sha256")
    .update(
      JSON.stringify(
        [...vms].sort((a, b) => a.externalId.localeCompare(b.externalId)),
      ),
    )
    .digest("hex");
}
function scopeConfig(scope: Scope) {
  const map = configSchema.parse(
    JSON.parse(process.env.LIVE_SCOPE_CONFIG_JSON || "{}"),
  );
  const config = map[scope.id];
  if (!config)
    throw new Error(
      `No live configuration for ${scope.provider} scope ${scope.id}`,
    );
  return config;
}
function required(value: string | undefined, name: string) {
  if (!value) throw new Error(`${name} is required for live collection`);
  return value;
}
function positive(value: unknown): number | null {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}
function state(value: unknown): VmInput["powerState"] {
  const v = String(value ?? "").toLowerCase();
  return ["running", "powered_on", "poweron"].includes(v)
    ? "running"
    : [
          "stopped",
          "terminated",
          "deallocated",
          "powered_off",
          "poweroff",
        ].includes(v)
      ? "stopped"
      : ["suspended", "paused"].includes(v)
        ? "suspended"
        : "unknown";
}
function tags(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object") return {};
  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
}
function base(scope: Scope, data: Omit<VmInput, "scopeId">): VmInput {
  return vmInputSchema.parse({ scopeId: scope.id, ...data });
}
async function json(url: string, headers: HeadersInit): Promise<unknown> {
  const response = await fetch(url, {
    headers,
    signal: AbortSignal.timeout(20_000),
    cache: "no-store",
  });
  if (!response.ok)
    throw new Error(
      `Live ${new URL(url).host} collection failed (HTTP ${response.status})`,
    );
  return response.json();
}
// Provider REST payloads vary by platform version; mapped fields are validated as VmInput.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Obj = Record<string, any>;
async function aws(scope: Scope, region: string): Promise<VmInput[]> {
  const { EC2Client, paginateDescribeInstances } =
    await import("@aws-sdk/client-ec2");
  const client = new EC2Client({ region, maxAttempts: 2 });
  const output: VmInput[] = [];
  try {
    for await (const page of paginateDescribeInstances(
      { client, pageSize: 100 },
      {},
    ))
      for (const reservation of page.Reservations ?? [])
        for (const vm of reservation.Instances ?? []) {
          if (!vm.InstanceId) throw new Error("EC2 instance has no stable ID");
          const labels = Object.fromEntries(
            (vm.Tags ?? [])
              .filter((t) => t.Key && t.Value)
              .map((t) => [t.Key!, t.Value!]),
          );
          output.push(
            base(scope, {
              externalId: vm.InstanceId,
              hostname: labels.Name || vm.PrivateDnsName || vm.InstanceId,
              ipAddresses: vm.PrivateIpAddress ? [vm.PrivateIpAddress] : [],
              operatingSystem: vm.PlatformDetails ?? null,
              cpuCores: positive(
                vm.CpuOptions?.CoreCount && vm.CpuOptions?.ThreadsPerCore
                  ? vm.CpuOptions.CoreCount * vm.CpuOptions.ThreadsPerCore
                  : null,
              ),
              memoryMB: null,
              diskGB: null,
              powerState: state(vm.State?.Name),
              region: vm.Placement?.AvailabilityZone ?? region,
              cluster: null,
              owner: labels.Owner ?? null,
              tags: labels,
            }),
          );
        }
  } finally {
    client.destroy();
  }
  return output;
}
async function azure(scope: Scope, subscriptionId: string): Promise<VmInput[]> {
  const { DefaultAzureCredential } = await import("@azure/identity");
  const token = await new DefaultAzureCredential().getToken(
    "https://management.azure.com/.default",
  );
  let url: string | undefined =
    `https://management.azure.com/subscriptions/${encodeURIComponent(subscriptionId)}/providers/Microsoft.Compute/virtualMachines?api-version=2024-03-01`;
  const output: VmInput[] = [];
  let pages = 0;
  while (url) {
    if (++pages > 1000) throw new Error("Azure pagination limit exceeded");
    const response: Obj = (await json(url, {
      Authorization: `Bearer ${token.token}`,
    })) as Obj;
    for (const vm of response.value ?? []) {
      if (!vm.id) throw new Error("Azure VM has no stable ID");
      output.push(
        base(scope, {
          externalId: vm.id,
          hostname: vm.name || vm.id,
          ipAddresses: [],
          operatingSystem:
            vm.properties?.storageProfile?.osDisk?.osType ?? null,
          cpuCores: null,
          memoryMB: null,
          diskGB: positive(vm.properties?.storageProfile?.osDisk?.diskSizeGB),
          powerState: "unknown",
          region: vm.location ?? null,
          cluster: null,
          owner: vm.tags?.Owner ?? null,
          tags: tags(vm.tags),
        }),
      );
    }
    url = response.nextLink;
    if (url && new URL(url).origin !== "https://management.azure.com")
      throw new Error("Untrusted Azure continuation URL");
  }
  return output;
}
async function gcp(scope: Scope, projectId: string): Promise<VmInput[]> {
  const { GoogleAuth } = await import("google-auth-library");
  const client = await new GoogleAuth({
    scopes: ["https://www.googleapis.com/auth/compute.readonly"],
  }).getClient();
  const output: VmInput[] = [];
  let token: string | undefined;
  let pages = 0;
  do {
    if (++pages > 1000) throw new Error("GCP pagination limit exceeded");
    const url = `https://compute.googleapis.com/compute/v1/projects/${encodeURIComponent(projectId)}/aggregated/instances?returnPartialSuccess=false${token ? `&pageToken=${encodeURIComponent(token)}` : ""}`;
    const response = (await client.request<Obj>({ url })).data;
    for (const group of Object.values(response.items ?? {}) as Obj[])
      for (const vm of group.instances ?? []) {
        if (!vm.id) throw new Error("GCP VM has no stable ID");
        output.push(
          base(scope, {
            externalId: String(vm.id),
            hostname: vm.name || String(vm.id),
            ipAddresses: (vm.networkInterfaces ?? [])
              .map((v: Obj) => v.networkIP)
              .filter(Boolean),
            operatingSystem: null,
            cpuCores: null,
            memoryMB: null,
            diskGB: positive(vm.disks?.[0]?.diskSizeGb),
            powerState: state(vm.status),
            region: vm.zone?.split("/").at(-1) ?? null,
            cluster: null,
            owner: vm.labels?.owner ?? null,
            tags: tags(vm.labels),
          }),
        );
      }
    token = response.nextPageToken;
  } while (token);
  return output;
}
async function vmware(scope: Scope, origin: string): Promise<VmInput[]> {
  const username = required(process.env.VMWARE_USERNAME, "VMWARE_USERNAME");
  const password = required(process.env.VMWARE_PASSWORD, "VMWARE_PASSWORD");
  const root = new URL(origin);
  if (root.protocol !== "https:") throw new Error("VMware URL must use HTTPS");
  const login = await fetch(new URL("/api/session", root), {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`,
    },
    signal: AbortSignal.timeout(20_000),
  });
  if (!login.ok)
    throw new Error(`VMware session failed (HTTP ${login.status})`);
  const session = (await login.json()) as string;
  try {
    const rows = (await json(new URL("/api/vcenter/vm", root).href, {
      "vmware-api-session-id": session,
    })) as Obj[];
    return rows.map((vm) =>
      base(scope, {
        externalId: required(vm.vm, "VMware VM ID"),
        hostname: vm.name || vm.vm,
        ipAddresses: [],
        operatingSystem: null,
        cpuCores: positive(vm.cpu_count),
        memoryMB: positive(vm.memory_size_MiB),
        diskGB: null,
        powerState: state(vm.power_state),
        region: null,
        cluster: vm.cluster ?? null,
        owner: null,
        tags: {},
      }),
    );
  } finally {
    await fetch(new URL("/api/session", root), {
      method: "DELETE",
      headers: { "vmware-api-session-id": session },
      signal: AbortSignal.timeout(5000),
    }).catch(() => {});
  }
}
async function proxmox(
  scope: Scope,
  origin: string,
  node?: string,
): Promise<VmInput[]> {
  const tokenId = required(process.env.PROXMOX_TOKEN_ID, "PROXMOX_TOKEN_ID");
  const secret = required(
    process.env.PROXMOX_TOKEN_SECRET,
    "PROXMOX_TOKEN_SECRET",
  );
  const root = new URL(origin);
  if (root.protocol !== "https:") throw new Error("Proxmox URL must use HTTPS");
  const data = (await json(
    new URL("/api2/json/cluster/resources?type=vm", root).href,
    { Authorization: `PVEAPIToken=${tokenId}=${secret}` },
  )) as Obj;
  return (data.data ?? [])
    .filter((vm: Obj) => !node || vm.node === node)
    .map((vm: Obj) =>
      base(scope, {
        externalId: `${vm.type || "qemu"}/${required(String(vm.vmid || ""), "Proxmox VM ID")}`,
        hostname: vm.name || String(vm.vmid),
        ipAddresses: [],
        operatingSystem: null,
        cpuCores: positive(vm.maxcpu),
        memoryMB: positive(vm.maxmem ? Math.round(vm.maxmem / 1048576) : null),
        diskGB: positive(
          vm.maxdisk ? Math.round(vm.maxdisk / 1073741824) : null,
        ),
        powerState: state(vm.status),
        region: null,
        cluster: vm.node ?? null,
        owner: null,
        tags: {},
      }),
    );
}
export async function collectLive(scope: Scope) {
  const c = scopeConfig(scope);
  const vms =
    scope.provider === "aws"
      ? await aws(scope, required(c.region, "region"))
      : scope.provider === "azure"
        ? await azure(scope, required(c.subscriptionId, "subscriptionId"))
        : scope.provider === "gcp"
          ? await gcp(scope, required(c.projectId, "projectId"))
          : scope.provider === "vmware"
            ? await vmware(scope, required(c.url, "url"))
            : await proxmox(scope, required(c.url, "url"), c.node);
  const seen = new Set<string>();
  return vms.map((vm) => {
    if (seen.has(vm.externalId))
      throw new Error(`Duplicate native ID ${vm.externalId}`);
    seen.add(vm.externalId);
    const nativePayload = toNative(scope.provider, vm);
    if (scope.provider === "azure")
      (nativePayload.hardwareProfile as Obj).vmSize = "unresolved";
    if (scope.provider === "gcp") nativePayload.machineType = "unresolved";
    return { externalId: vm.externalId, nativePayload };
  });
}
