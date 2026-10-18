"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Search, Database, RefreshCw } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
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
  DetailRow,
  TableFrame,
  VmGlyph,
  DetailLink,
  DateText,
} from "@/components/console-ui";
import { api, type Scope, type Inventory, type Paged } from "@/components/api";
export default function InventoryPage() {
  const [scopes, setScopes] = useState<Scope[]>([]),
    [list, setList] = useState<Paged<Inventory> | null>(null),
    [scopeId, setScopeId] = useState(""),
    [status, setStatus] = useState(""),
    [q, setQ] = useState(""),
    [page, setPage] = useState(1),
    [error, setError] = useState(""),
    [viewing, setViewing] = useState<Inventory | null>(null);
  const refresh = useCallback(async () => {
    const query = new URLSearchParams({
      page: String(page),
      pageSize: "25",
      ...(scopeId ? { scopeId } : {}),
      ...(status ? { status } : {}),
      ...(q ? { q } : {}),
    });
    const [s, l] = await Promise.all([
      api<Scope[]>("/api/providers"),
      api<Paged<Inventory>>(`/api/inventory-vms?${query}`),
    ]);
    setScopes(s);
    setList(l);
    setError("");
  }, [scopeId, status, q, page]);
  useEffect(() => {
    refresh().catch((e) => {
      setList(null);
      setError(e.message);
    });
  }, [refresh]);
  return (
    <>
      <PageHeader
        eyebrow="Destination / records"
        title="VM inventory"
        description="Centralized VM inventory read directly from NetBox."
      />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#dce5d9] bg-[#f4f8f1] px-4 py-3 text-xs text-[#426344]">
        <span>
          <strong>NetBox inventory</strong> · VM records are read from the local
          NetBox server. The environment filter identifies the cloud source.
        </span>
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            refresh().catch((e) => {
              setList(null);
              setError(e.message);
            })
          }
        >
          <RefreshCw size={14} /> Refresh
        </Button>
      </div>
      <section className="surface mb-5 p-4 sm:p-5">
        <div className="grid gap-3 md:grid-cols-3">
          <div>
            <Label htmlFor="scope" className="text-xs font-bold">
              Source environment
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
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="status" className="text-xs font-bold">
              Lifecycle status
            </Label>
            <select
              id="status"
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(1);
              }}
              className="field-control mt-2"
            >
              <option value="">All states</option>
              {["active", "orphaned", "decommissioned"].map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="q" className="text-xs font-bold">
              Find a machine
            </Label>
            <div className="relative mt-2">
              <Search
                className="absolute left-3 top-1/2 -translate-y-1/2 text-[#a1a9a0]"
                size={16}
              />
              <Input
                id="q"
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  setPage(1);
                }}
                placeholder="Hostname or native ID"
                className="h-10 rounded-lg border-[#e3e4dd] pl-9"
              />
            </div>
          </div>
        </div>
      </section>
      {error && (
        <div className="mb-4">
          <Status tone="error">{error}</Status>
        </div>
      )}
      <SectionTitle
        title="Destination records"
        description={`${list?.total ?? 0} ${list?.total === 1 ? "virtual machine" : "virtual machines"} in this view`}
        action={
          <span className="hidden rounded-full bg-[#edf1e9] px-3 py-1 text-[10px] font-bold text-[#70836a] sm:inline">
            NETBOX API
          </span>
        }
      />
      <TableFrame>
        <table className="hidden w-full min-w-[790px] table-fixed text-left text-xs md:table">
          <thead className="bg-[#f8f8f5] text-[10px] font-bold uppercase tracking-[.1em] text-[#929a91]">
            <tr>
              <th className="w-[27%] px-5 py-3.5">Machine</th>
              <th className="w-[22%] px-4 py-3.5">Environment</th>
              <th className="w-[14%] px-4 py-3.5">Lifecycle</th>
              <th className="w-[17%] px-4 py-3.5">Capacity</th>
              <th className="w-[12%] px-4 py-3.5">Last seen</th>
              <th className="w-[8%] px-4 py-3.5">Details</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#eeeee8]">
            {list?.items.map((vm) => (
              <tr key={vm.id} className="hover:bg-[#fafaf7]">
                <td className="px-5 py-4">
                  <div className="flex min-w-0 items-center gap-3">
                    <VmGlyph />
                    <div className="min-w-0">
                      <div className="truncate font-bold text-[#364036]">
                        {vm.hostname}
                      </div>
                      <div
                        title={vm.externalId}
                        className="mt-1 truncate font-mono text-[10px] text-[#9ba49a]"
                      >
                        {vm.externalId}
                      </div>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-4">
                  <div className="flex items-center gap-2">
                    <ProviderMark provider={vm.provider} />
                    <div className="min-w-0">
                      <div className="truncate font-semibold">
                        {vm.scopeName}
                      </div>
                      <div className="text-[10px] uppercase text-[#9aa198]">
                        {vm.provider}
                      </div>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-4">
                  <Pill value={vm.lifecycleStatus} />
                </td>
                <td className="px-4 py-4">
                  <Spec cpu={vm.cpuCores} memory={vm.memoryMB} />
                </td>
                <td className="px-4 py-4">
                  <DateText value={vm.lastSeenAt} />
                </td>
                <td className="px-4 py-4">
                  <DetailLink onClick={() => setViewing(vm)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="divide-y divide-[#eeeee8] md:hidden">
          {list?.items.map((vm) => (
            <div key={vm.id} className="p-4">
              <div className="flex items-start gap-3">
                <ProviderMark provider={vm.provider} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-bold">
                    {vm.hostname}
                  </div>
                  <div className="mt-1 truncate font-mono text-[10px] text-[#9aa198]">
                    {vm.externalId}
                  </div>
                  <div className="mt-2 text-[11px] text-[#8a9389]">
                    {vm.scopeName}
                  </div>
                </div>
                <Pill value={vm.lifecycleStatus} />
              </div>
              <div className="mt-4 flex items-center justify-between">
                <Spec cpu={vm.cpuCores} memory={vm.memoryMB} />
                <DetailLink onClick={() => setViewing(vm)} />
              </div>
            </div>
          ))}
        </div>
        {!list && (
          <div className="p-6 text-xs text-[#8e978e]">
            Loading inventory records…
          </div>
        )}
        {list?.items.length === 0 && (
          <EmptyState
            title="No inventory records"
            description="Adjust your filters or synchronize a cloud source into NetBox."
            action={
              <Link href="/sync" className="text-xs font-bold text-[#a96542]">
                Open synchronization →
              </Link>
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
      <Sheet
        open={!!viewing}
        onOpenChange={(open) => {
          if (!open) setViewing(null);
        }}
      >
        <SheetContent side="right" className="record-drawer">
          <SheetHeader className="shrink-0 border-b border-[#e1e6de] bg-white px-5 py-5 pr-14 text-left sm:px-6 sm:pr-14">
            <div className="mb-3 flex items-center gap-3">
              <ProviderMark provider={viewing?.provider ?? ""} />
              <span className="text-[10px] font-bold uppercase tracking-[.15em] text-[#929a91]">
                NetBox / {viewing?.provider}
              </span>
            </div>
            <SheetTitle className="record-value text-[22px] font-extrabold leading-tight tracking-tight text-[#263126]">
              {viewing?.hostname}
            </SheetTitle>
            <p className="record-value font-data text-[12px] leading-relaxed text-[#59685b]">
              {viewing?.externalId}
            </p>
          </SheetHeader>
          {viewing && (
            <div className="record-drawer-body p-5 sm:p-6">
              <div className="mb-5 flex flex-wrap gap-2">
                <Pill value={viewing.lifecycleStatus} />
                <Pill value={viewing.powerState} />
              </div>
              <dl>
                <DetailRow label="Environment" value={viewing.scopeName} />
                <DetailRow label="Native ID" value={viewing.externalId} mono />
                <DetailRow
                  label="IP addresses"
                  value={viewing.ipAddresses.join(", ") || "—"}
                />
                <DetailRow label="OS" value={viewing.operatingSystem} />
                <DetailRow
                  label="CPU"
                  value={`${viewing.cpuCores ?? "—"} cores`}
                />
                <DetailRow
                  label="Memory"
                  value={`${viewing.memoryMB ?? "—"} MB`}
                />
                <DetailRow label="Disk" value={`${viewing.diskGB ?? "—"} GB`} />
                <DetailRow label="Region" value={viewing.region} />
                <DetailRow label="Cluster" value={viewing.cluster} />
                <DetailRow label="Owner" value={viewing.owner} />
                <DetailRow
                  label="Missing scans"
                  value={viewing.consecutiveMissingScans}
                />
                <DetailRow
                  label="Last seen"
                  value={
                    viewing.lastSeenAt
                      ? new Date(viewing.lastSeenAt).toLocaleString()
                      : "—"
                  }
                />
                <DetailRow
                  label="Tags"
                  value={
                    Object.entries(viewing.tags)
                      .map(([k, v]) => `${k}: ${v}`)
                      .join(" · ") || "—"
                  }
                />
              </dl>
              <div className="mt-6 rounded-xl border border-[#e9e7dc] bg-white p-4 text-xs leading-relaxed text-[#858e83]">
                <Database size={17} className="mb-2 text-[#a66a48]" />
                This record is read from NetBox. Changes made in NetBox appear
                as drift in the next preview.
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
