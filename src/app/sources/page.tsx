"use client";
import { useCallback, useEffect, useState } from "react";
import { Plus, Search, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  PageHeader,
  Status,
  SectionTitle,
  EmptyState,
} from "@/components/shell";
import {
  ProviderMark,
  Pill,
  Spec,
  TableFrame,
  VmGlyph,
  DetailLink,
} from "@/components/console-ui";
import { SourceDetailDrawer } from "@/components/source-detail-drawer";
import {
  api,
  body,
  type Scope,
  type Source,
  type Paged,
} from "@/components/api";
import type { Provider } from "@/lib/contracts";
const operatingSystems = [
  "Ubuntu 22.04",
  "Ubuntu 24.04",
  "Debian 12",
  "RHEL 9",
  "Windows Server 2022",
  "Windows Server 2025",
  "Other Linux",
  "Other Windows",
];
const cpuChoices = [1, 2, 4, 6, 8, 12, 16, 24, 32, 64];
const memoryChoices = [
  512, 1024, 2048, 4096, 6144, 8192, 12288, 16384, 24576, 32768, 65536, 131072,
];
const diskChoices = [
  10, 20, 30, 40, 50, 80, 100, 120, 160, 200, 250, 500, 1000,
];
const locations: Record<Provider, string[]> = {
  aws: [
    "ap-south-1a",
    "ap-south-1b",
    "us-east-1a",
    "us-east-1b",
    "us-west-2a",
    "eu-west-1a",
  ],
  azure: ["centralindia", "southindia", "eastus", "westus2", "westeurope"],
  gcp: [
    "asia-south1-a",
    "asia-south1-b",
    "us-central1-a",
    "us-east1-b",
    "europe-west1-b",
  ],
  vmware: [],
  proxmox: [],
};
const clusters: Record<Provider, string[]> = {
  aws: [],
  azure: [],
  gcp: [],
  vmware: ["compute-a", "compute-b"],
  proxmox: ["pve-a", "pve-b"],
};
function withCurrent(options: string[], current: string) {
  return current && !options.includes(current)
    ? [current, ...options]
    : options;
}
function locationOptions(scope: Scope | undefined) {
  if (!scope) return [];
  const options = locations[scope.provider];
  if (scope.provider !== "aws") return options;
  const configuredRegion = scope.environment.split("/").at(-1)?.trim();
  const matching = configuredRegion
    ? options.filter((option) => option.startsWith(configuredRegion))
    : [];
  return matching.length ? matching : options;
}
type Form = {
  scopeId: string;
  externalId: string;
  hostname: string;
  ipAddresses: string;
  operatingSystem: string;
  cpuCores: string;
  memoryMB: string;
  diskGB: string;
  powerState: string;
  region: string;
  cluster: string;
  owner: string;
  tags: string;
};
const blank = (scopeId: string): Form => ({
  scopeId,
  externalId: "",
  hostname: "",
  ipAddresses: "",
  operatingSystem: "",
  cpuCores: "",
  memoryMB: "",
  diskGB: "",
  powerState: "running",
  region: "",
  cluster: "",
  owner: "",
  tags: "{}",
});
const fromSource = (s: Source): Form => ({
  scopeId: s.scopeId,
  externalId: s.externalId,
  hostname: s.normalized.hostname,
  ipAddresses: s.normalized.ipAddresses.join(", "),
  operatingSystem: s.normalized.operatingSystem ?? "",
  cpuCores: String(s.normalized.cpuCores ?? ""),
  memoryMB: String(s.normalized.memoryMB ?? ""),
  diskGB: String(s.normalized.diskGB ?? ""),
  powerState: s.normalized.powerState,
  region: s.normalized.region ?? "",
  cluster: s.normalized.cluster ?? "",
  owner: s.normalized.owner ?? "",
  tags: JSON.stringify(s.normalized.tags, null, 2),
});
export default function SourcesPage() {
  const [scopes, setScopes] = useState<Scope[]>([]),
    [list, setList] = useState<Paged<Source> | null>(null),
    [scopeId, setScopeId] = useState(""),
    [q, setQ] = useState(""),
    [page, setPage] = useState(1),
    [editing, setEditing] = useState<Source | null>(null),
    [viewing, setViewing] = useState<Source | null>(null),
    [open, setOpen] = useState(false),
    [form, setForm] = useState<Form>(blank("")),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  const [sourceMode, setSourceMode] = useState<"simulation" | "live">(
    "simulation",
  );
  const refresh = useCallback(async () => {
    const [s, l, jobs] = await Promise.all([
      api<Scope[]>("/api/providers"),
      api<Paged<Source>>(
        `/api/source-vms?${new URLSearchParams({ page: String(page), pageSize: "25", ...(scopeId ? { scopeId } : {}), ...(q ? { q } : {}) })}`,
      ),
      api<{ sourceMode: "simulation" | "live" }>("/api/sync/jobs"),
    ]);
    setScopes(s);
    setList(l);
    setSourceMode(jobs.sourceMode);
  }, [scopeId, q, page]);
  useEffect(() => {
    refresh().catch((e) => setError(e.message));
  }, [refresh]);
  const change = (key: keyof Form, value: string) =>
    setForm((f) => ({ ...f, [key]: value }));
  const formScope = scopes.find((scope) => scope.id === form.scopeId);
  const selectedProvider = formScope?.provider;
  const edit = (s: Source) => {
    setError("");
    setEditing(s);
    setForm(fromSource(s));
    setOpen(true);
  };
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const tags = JSON.parse(form.tags);
      if (
        !tags ||
        Array.isArray(tags) ||
        typeof tags !== "object" ||
        Object.values(tags).some((v) => typeof v !== "string")
      )
        throw new Error("Tags must be a JSON object with string values.");
      const payload = {
        scopeId: form.scopeId,
        externalId: form.externalId,
        hostname: form.hostname,
        ipAddresses: form.ipAddresses
          .split(",")
          .map((v) => v.trim())
          .filter(Boolean),
        operatingSystem: form.operatingSystem || null,
        cpuCores: form.cpuCores ? Number(form.cpuCores) : null,
        memoryMB: form.memoryMB ? Number(form.memoryMB) : null,
        diskGB: form.diskGB ? Number(form.diskGB) : null,
        powerState: form.powerState,
        region: form.region || null,
        cluster: form.cluster || null,
        owner: form.owner || null,
        tags,
      };
      if (editing)
        await api(`/api/source-vms/${editing.id}`, body("PATCH", payload));
      else await api("/api/source-vms", body("POST", payload));
      setOpen(false);
      setNotice("Source saved. Automatic synchronization queued.");
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }
  async function remove(s: Source) {
    if (
      !window.confirm(
        `Remove ${s.normalized.hostname} from this simulated source? Automatic synchronization will safely mark it missing.`,
      )
    )
      return;
    setBusy(true);
    setError("");
    try {
      await api(`/api/source-vms/${s.id}`, body("DELETE"));
      setViewing(null);
      setNotice(
        "Source removed. Automatic synchronization queued; check run history for orphan handling.",
      );
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function mode(s: Scope, value: string) {
    setBusy(true);
    setError("");
    try {
      await api(
        `/api/providers/${s.id}`,
        body("PATCH", { simulationMode: value }),
      );
      setNotice(`${s.name}: collection mode set to ${value}.`);
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const selectedScope = scopes.find((s) => s.id === scopeId);
  return (
    <>
      <PageHeader
        eyebrow="Environments / provider records"
        title="Cloud sources"
        description={
          sourceMode === "live"
            ? "Read-only discovery from configured cloud APIs. Collection failures leave inventory unchanged."
            : "Persistent simulated provider records. Changes queue automatic synchronization to NetBox."
        }
        action={
          sourceMode === "simulation" && (
            <Button
              className="bg-[#ae6946] text-white hover:bg-[#975638]"
              onClick={() => {
                setError("");
                setEditing(null);
                setForm(blank(scopeId || scopes[0]?.id || ""));
                setOpen(true);
              }}
              disabled={!scopes.length}
            >
              <Plus size={16} /> Add VM
            </Button>
          )
        }
      />
      <section className="surface mb-5 p-4 sm:p-5">
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] md:items-end">
          <div>
            <Label htmlFor="scope" className="text-xs font-bold">
              Provider environment
            </Label>
            <select
              id="scope"
              value={scopeId}
              onChange={(e) => {
                setScopeId(e.target.value);
                setPage(1);
              }}
              className="field-control mt-2"
            >
              <option value="">All environments</option>
              {scopes.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} · {s.provider.toUpperCase()}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="search" className="text-xs font-bold">
              Find a machine
            </Label>
            <div className="relative mt-2">
              <Search
                className="absolute left-3 top-1/2 -translate-y-1/2 text-[#a1a9a0]"
                size={16}
              />
              <Input
                id="search"
                className="h-10 rounded-lg border-[#e3e4dd] pl-9"
                placeholder="Hostname or native ID"
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  setPage(1);
                }}
              />
            </div>
          </div>
          <Button
            variant="outline"
            className="h-10"
            onClick={() => refresh().catch((e) => setError(e.message))}
          >
            <RefreshCw size={15} /> Refresh
          </Button>
        </div>
        {selectedScope && sourceMode === "simulation" && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-[#edece6] pt-4">
            <div>
              <div className="text-xs font-bold">Collection simulation</div>
              <p className="mt-1 text-[11px] text-[#929a91]">
                Failed or partial snapshots skip this entire environment.
              </p>
            </div>
            <select
              aria-label="Collection simulation mode"
              value={selectedScope.simulationMode}
              onChange={(e) => mode(selectedScope, e.target.value)}
              disabled={busy}
              className="field-control max-w-[180px]"
            >
              <option value="ok">Complete</option>
              <option value="partial">Partial</option>
              <option value="failed">Failed</option>
            </select>
          </div>
        )}
      </section>
      {error && (
        <div className="mb-4">
          <Status tone="error">{error}</Status>
        </div>
      )}
      {notice && (
        <div className="mb-4">
          <Status tone="success">{notice}</Status>
        </div>
      )}
      <SectionTitle
        title="Source records"
        description={`${list?.total ?? 0} ${list?.total === 1 ? "virtual machine" : "virtual machines"} in this view`}
      />
      <TableFrame>
        <table className="hidden w-full min-w-[760px] table-fixed text-left text-xs md:table">
          <thead className="bg-[#f8f8f5] text-[10px] font-bold uppercase tracking-[.1em] text-[#929a91]">
            <tr>
              <th className="w-[31%] px-5 py-3.5">Machine</th>
              <th className="w-[23%] px-4 py-3.5">Environment</th>
              <th className="w-[15%] px-4 py-3.5">Power</th>
              <th className="w-[19%] px-4 py-3.5">Capacity</th>
              <th className="w-[12%] px-4 py-3.5">Details</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#eeeee8]">
            {list?.items.map((s) => (
              <tr key={s.id} className="hover:bg-[#fafaf7]">
                <td className="px-5 py-4">
                  <div className="flex min-w-0 items-center gap-3">
                    <VmGlyph />
                    <div className="min-w-0">
                      <div className="truncate font-bold text-[#364036]">
                        {s.normalized.hostname}
                      </div>
                      <div
                        title={s.externalId}
                        className="mt-1 truncate font-mono text-[10px] text-[#9ba49a]"
                      >
                        {s.externalId}
                      </div>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-4">
                  <div className="flex items-center gap-2">
                    <ProviderMark provider={s.provider} />
                    <div className="min-w-0">
                      <div className="truncate font-semibold">
                        {s.scopeName}
                      </div>
                      <div className="text-[10px] uppercase text-[#9aa198]">
                        {s.provider}
                      </div>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-4">
                  <Pill value={s.normalized.powerState} />
                </td>
                <td className="px-4 py-4">
                  <Spec
                    cpu={s.normalized.cpuCores}
                    memory={s.normalized.memoryMB}
                  />
                </td>
                <td className="px-4 py-4">
                  <DetailLink onClick={() => setViewing(s)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="divide-y divide-[#eeeee8] md:hidden">
          {list?.items.map((s) => (
            <div key={s.id} className="p-4">
              <div className="flex items-start gap-3">
                <ProviderMark provider={s.provider} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-bold">
                    {s.normalized.hostname}
                  </div>
                  <div className="mt-1 truncate font-mono text-[10px] text-[#9aa198]">
                    {s.externalId}
                  </div>
                  <div className="mt-2 text-[11px] text-[#8a9389]">
                    {s.scopeName}
                  </div>
                </div>
                <Pill value={s.normalized.powerState} />
              </div>
              <div className="mt-4 flex items-center justify-between">
                <Spec
                  cpu={s.normalized.cpuCores}
                  memory={s.normalized.memoryMB}
                />
                <DetailLink onClick={() => setViewing(s)} />
              </div>
            </div>
          ))}
        </div>
        {!list && (
          <div className="p-6 text-xs text-[#8e978e]">
            Loading source records…
          </div>
        )}
        {list?.items.length === 0 && (
          <EmptyState
            title="No matching source VMs"
            description={
              sourceMode === "live"
                ? "Check the live scope configuration and filters."
                : "Adjust your filters or create a simulated machine."
            }
          />
        )}
      </TableFrame>
      {list && (
        <div className="mt-4 flex items-center justify-between gap-3 text-xs text-[#90998f]">
          <span>
            {list.total} records · Page {page}
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page === 1}
              onClick={() => setPage(page - 1)}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page * 25 >= list.total}
              onClick={() => setPage(page + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}
      <SourceDetailDrawer
        source={viewing}
        readOnly={sourceMode === "live"}
        busy={busy}
        onClose={() => setViewing(null)}
        onEdit={(source) => {
          edit(source);
          setViewing(null);
        }}
        onRemove={remove}
      />
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="font-display text-xl font-extrabold">
              {editing ? "Edit source machine" : "Add source machine"}
            </DialogTitle>
            <DialogDescription>
              This changes the simulated provider only. Inventory updates after
              a sync.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={save} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              {!editing && (
                <div>
                  <Label htmlFor="form-scope">Environment</Label>
                  <select
                    id="form-scope"
                    value={form.scopeId}
                    onChange={(e) =>
                      setForm((current) => ({
                        ...current,
                        scopeId: e.target.value,
                        region: "",
                        cluster: "",
                      }))
                    }
                    required
                    className="field-control mt-1"
                  >
                    {scopes.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              {(!editing ? ["externalId", "hostname"] : ["hostname"]).map(
                (k) => (
                  <div key={k}>
                    <Label htmlFor={`form-${k}`}>
                      {k === "externalId" ? "Native resource ID" : "Hostname"}
                    </Label>
                    <Input
                      id={`form-${k}`}
                      required
                      value={form[k as keyof Form]}
                      onChange={(e) => change(k as keyof Form, e.target.value)}
                      className="mt-1"
                    />
                  </div>
                ),
              )}
              {(
                [
                  ["ipAddresses", "IP addresses (comma separated)"],
                  ["owner", "Owner"],
                ] as const
              ).map(([k, label]) => (
                <div key={k}>
                  <Label htmlFor={`form-${k}`}>{label}</Label>
                  <Input
                    id={`form-${k}`}
                    value={form[k]}
                    onChange={(e) => change(k, e.target.value)}
                    className="mt-1"
                  />
                </div>
              ))}
              {(
                [
                  ["operatingSystem", "Operating system", operatingSystems],
                  ["cpuCores", "CPU cores", cpuChoices.map(String)],
                  ["memoryMB", "Memory", memoryChoices.map(String)],
                  ["diskGB", "Disk", diskChoices.map(String)],
                ] as const
              ).map(([key, label, options]) => (
                <div key={key}>
                  <Label htmlFor={`form-${key}`}>{label}</Label>
                  <select
                    id={`form-${key}`}
                    value={form[key]}
                    onChange={(e) => change(key, e.target.value)}
                    className="field-control mt-1"
                  >
                    <option value="">Not specified</option>
                    {withCurrent([...options], form[key]).map((value) => (
                      <option key={value} value={value}>
                        {key === "memoryMB"
                          ? `${Number(value) / 1024} GB`
                          : key === "diskGB"
                            ? `${value} GB`
                            : value}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
              {selectedProvider && locationOptions(formScope).length > 0 && (
                <div>
                  <Label htmlFor="form-region">
                    {selectedProvider === "aws" || selectedProvider === "gcp"
                      ? "Availability zone"
                      : "Region"}
                  </Label>
                  <select
                    id="form-region"
                    value={form.region}
                    onChange={(e) => change("region", e.target.value)}
                    className="field-control mt-1"
                  >
                    <option value="">Not specified</option>
                    {withCurrent(locationOptions(formScope), form.region).map(
                      (value) => (
                        <option key={value} value={value}>
                          {value}
                        </option>
                      ),
                    )}
                  </select>
                </div>
              )}
              {selectedProvider && clusters[selectedProvider].length > 0 && (
                <div>
                  <Label htmlFor="form-cluster">
                    {selectedProvider === "proxmox" ? "Node" : "Cluster"}
                  </Label>
                  <select
                    id="form-cluster"
                    value={form.cluster}
                    onChange={(e) => change("cluster", e.target.value)}
                    className="field-control mt-1"
                  >
                    <option value="">Not specified</option>
                    {withCurrent(clusters[selectedProvider], form.cluster).map(
                      (value) => (
                        <option key={value} value={value}>
                          {value}
                        </option>
                      ),
                    )}
                  </select>
                </div>
              )}
              <div>
                <Label htmlFor="form-power">Power state</Label>
                <select
                  id="form-power"
                  value={form.powerState}
                  onChange={(e) => change("powerState", e.target.value)}
                  className="field-control mt-1"
                >
                  {["running", "stopped", "suspended", "unknown"].map((x) => (
                    <option key={x}>{x}</option>
                  ))}
                </select>
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="form-tags">Tags (JSON object)</Label>
                <textarea
                  id="form-tags"
                  value={form.tags}
                  onChange={(e) => change("tags", e.target.value)}
                  rows={3}
                  className="field-control mt-1 h-auto p-3 font-mono text-xs"
                />
              </div>
            </div>
            {error && <Status tone="error">{error}</Status>}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={busy}
                className="bg-[#ae6946] text-white hover:bg-[#975638]"
              >
                {busy ? "Saving…" : "Save source"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
