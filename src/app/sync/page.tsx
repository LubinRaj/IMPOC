"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  RefreshCw,
  ArrowRight,
  AlertTriangle,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  PageHeader,
  Status,
  SectionTitle,
  EmptyState,
} from "@/components/shell";
import { ProviderMark, Pill } from "@/components/console-ui";
import { api, body, fmt, type Scope, type Preview } from "@/components/api";
const kinds = [
  "CREATE",
  "UPDATE",
  "MARK_ORPHAN",
  "DECOMMISSION",
  "RESTORE",
  "NO_CHANGE",
];
const format = (x: unknown) =>
  x === null || x === undefined
    ? "—"
    : typeof x === "object"
      ? JSON.stringify(x)
      : String(x);
export default function SyncPage() {
  const [scopes, setScopes] = useState<Scope[]>([]),
    [netboxStatus, setNetboxStatus] = useState("Checking NetBox…"),
    [sourceMode, setSourceMode] = useState<"simulation" | "live">("simulation"),
    [selected, setSelected] = useState<string[]>([]),
    [plan, setPlan] = useState<Preview | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [result, setResult] = useState<{
      runId: string;
      status: string;
      replayed: boolean;
    } | null>(null);
  useEffect(() => {
    api<Scope[]>("/api/providers")
      .then((s) => {
        setScopes(s);
        setSelected(s.map((x) => x.id));
      })
      .catch((e) => setError(e.message));
  }, []);
  useEffect(() => {
    api<{ status: string; version: string }>("/api/netbox/status")
      .then((value) => setNetboxStatus(`Connected · NetBox ${value.version}`))
      .catch((error) => setNetboxStatus(`Unavailable · ${error.message}`));
    api<{ sourceMode: "simulation" | "live" }>("/api/sync/jobs")
      .then((value) => setSourceMode(value.sourceMode))
      .catch(() => {});
  }, []);
  const toggle = (id: string) => {
    setSelected((old) =>
      old.includes(id) ? old.filter((x) => x !== id) : [...old, id],
    );
    setPlan(null);
    setResult(null);
  };
  async function preview() {
    setBusy(true);
    setError("");
    setNotice("");
    setResult(null);
    try {
      setPlan(
        await api<Preview>(
          "/api/sync/preview",
          body("POST", { scopeIds: selected, destination: "netbox" }),
        ),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function apply() {
    if (!plan) return;
    if (
      !window.confirm(
        plan.scopes.some((s) => s.collectionStatus === "complete")
          ? "Apply this preview to NetBox? Orphans and decommissions change lifecycle status only; no VM is deleted."
          : "Record this failed collection in sync history? No inventory changes will be made.",
      )
    )
      return;
    setBusy(true);
    setError("");
    try {
      const r = await api<{ runId: string; status: string; replayed: boolean }>(
        "/api/sync/apply",
        body("POST", { planId: plan.planId }),
      );
      setResult(r);
      setNotice(
        `Sync ${r.status}. Review the run and inventory for applied results.`,
      );
      setPlan(null);
    } catch (e) {
      setError((e as Error).message);
      if ((e as Error).message.toLowerCase().includes("preview")) setPlan(null);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageHeader
        eyebrow="Reconciliation / plan & apply"
        title="Synchronization"
        description="Compare cloud source snapshots with NetBox, inspect field drift, then apply a guarded plan."
      />
      <section
        className="surface mb-5 p-4 sm:p-5"
        aria-label="Synchronization destination"
      >
        <div className="flex flex-wrap items-center gap-3">
          <div className="mr-auto">
            <div className="text-xs font-extrabold text-[#2d342d]">
              Central inventory · NetBox
            </div>
            <div className="mt-1 text-[11px] text-[#8b928a]">
              All previews and applies target NetBox.
            </div>
          </div>
        </div>
        <p className="mt-3 text-[11px] text-[#677767]" role="status">
          {netboxStatus}
        </p>
      </section>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.7fr)_minmax(270px,.7fr)]">
        <section className="surface p-5 sm:p-6">
          <SectionTitle
            title="Collection scopes"
            description="Choose the environments to include in the next snapshot"
            action={
              <button
                onClick={() => {
                  setSelected(scopes.map((s) => s.id));
                  setPlan(null);
                }}
                className="text-xs font-bold text-[#a76643] hover:underline"
              >
                Select all
              </button>
            }
          />
          <div className="grid gap-2 sm:grid-cols-2">
            {scopes.map((s) => (
              <label
                key={s.id}
                className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3.5 transition-colors ${selected.includes(s.id) ? "border-[#d3dcd0] bg-[#f8faf6]" : "border-[#e9eae3] hover:bg-[#fafaf7]"}`}
              >
                <Checkbox
                  checked={selected.includes(s.id)}
                  onCheckedChange={() => toggle(s.id)}
                  aria-label={`Select ${s.name}`}
                />
                <ProviderMark provider={s.provider} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-bold">
                    {s.name}
                  </span>
                  <span className="mt-1 block text-[10px] text-[#929a91]">
                    {sourceMode === "live"
                      ? "Live discovery"
                      : `${s.sourceCount} source VMs`}{" "}
                    · {s.provider.toUpperCase()}
                  </span>
                </span>
                <Pill
                  value={sourceMode === "live" ? "live" : s.simulationMode}
                />
              </label>
            ))}
          </div>
          <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-[#eeeee8] pt-5">
            <Button
              onClick={preview}
              disabled={busy || !selected.length}
              className="bg-[#ae6946] text-white hover:bg-[#975638]"
            >
              <RefreshCw size={15} />
              {busy ? "Working…" : "Preview NetBox"}
            </Button>
            <p className="text-[11px] text-[#929a91]">
              {selected.length} of {scopes.length} environments selected
            </p>
          </div>
        </section>
        <aside className="rounded-2xl bg-[#2b342b] p-5 text-white sm:p-6">
          <div className="grid size-10 place-items-center rounded-xl bg-white/10 text-[#d3a181]">
            <ShieldCheck size={20} />
          </div>
          <h2 className="mt-6 font-display text-xl font-extrabold tracking-tight">
            Review before apply
          </h2>
          <p className="mt-3 text-xs leading-relaxed text-[#b6c2b5]">
            A preview shows creates, updates, lifecycle changes, and exact field
            differences. The destination stays unchanged until you apply it.
          </p>
          <div className="mt-6 border-t border-white/15 pt-5 text-[11px] leading-relaxed text-[#a5b4a5]">
            Failed and partial collections are isolated. An empty complete
            collection can safely mark missing VMs orphaned.
          </div>
        </aside>
      </div>
      {error && (
        <div className="mt-5">
          <Status tone="error">
            {error} Generate a fresh preview before applying.
          </Status>
        </div>
      )}
      {notice && (
        <div className="mt-5">
          <Status
            tone={
              result?.status === "failed"
                ? "error"
                : result?.status === "partial"
                  ? "neutral"
                  : "success"
            }
          >
            {notice}{" "}
            {result && (
              <Link
                className="font-bold underline"
                href={`/history?run=${result.runId}`}
              >
                Open run <ArrowRight className="inline" size={14} />
              </Link>
            )}
          </Status>
        </div>
      )}
      {plan && (
        <section className="mt-8">
          <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
            <div>
              <div className="eyebrow mb-2">Review / pending plan</div>
              <h2 className="font-display text-2xl font-extrabold">
                Preview results
              </h2>
              <p className="mt-1 text-xs text-[#8b948a]">
                Expires {fmt(plan.expiresAt)} · Inventory is unchanged until
                apply.
              </p>
            </div>
            <Button
              disabled={busy}
              onClick={apply}
              className="bg-[#ae6946] text-white hover:bg-[#975638]"
            >
              {plan.scopes.some((s) => s.collectionStatus === "complete")
                ? "Apply reviewed plan"
                : "Record failed run"}{" "}
              <ArrowRight size={15} />
            </Button>
          </div>
          <div className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
            {kinds.map((k) => (
              <div key={k} className="surface p-4">
                <div className="text-[10px] font-bold uppercase tracking-[.07em] text-[#929a91]">
                  {k.replaceAll("_", " ")}
                </div>
                <div className="mt-2 font-display text-2xl font-extrabold">
                  {plan.summary[k] ?? 0}
                </div>
              </div>
            ))}
          </div>
          <div className="space-y-4">
            {plan.scopes.map((s) => (
              <div key={s.scopeId} className="surface overflow-hidden">
                <div className="flex flex-wrap items-center gap-3 border-b border-[#eeeee8] bg-[#fcfcf9] p-4 sm:px-5">
                  <ProviderMark provider={s.provider} />
                  <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-extrabold">
                      {scopes.find((x) => x.id === s.scopeId)?.name ??
                        s.provider}
                    </h3>
                    <p className="text-[10px] uppercase text-[#929a91]">
                      {s.provider}
                    </p>
                  </div>
                  <Pill value={s.collectionStatus} />
                  <span className="text-[11px] text-[#929a91]">
                    {s.changes.length} actions
                  </span>
                </div>
                {s.error && (
                  <div className="p-5">
                    <Status tone="error">
                      <AlertTriangle className="mr-2 inline" size={15} />
                      {s.error}
                    </Status>
                  </div>
                )}
                {!s.error && !s.changes.length && (
                  <EmptyState
                    title="No changes"
                    description="This scope is already aligned with its source snapshot."
                  />
                )}
                <div className="divide-y divide-[#eeeee8]">
                  {s.changes.map((c) => (
                    <div key={c.externalId} className="p-4 sm:px-5">
                      <div className="flex min-w-0 flex-wrap items-center gap-2.5">
                        <Pill value={c.kind} />
                        <span className="min-w-0 break-all font-mono text-[11px] font-bold text-[#465046]">
                          {c.externalId}
                        </span>
                        <span className="ml-auto text-[10px] text-[#9aa198]">
                          {c.fields.length} fields
                        </span>
                      </div>
                      {c.fields.length > 0 && (
                        <div className="mt-3 rounded-lg border border-[#e8e9e2]">
                          <div className="data-scroll">
                            <table className="w-full min-w-[520px] table-fixed text-left text-[11px]">
                              <thead className="bg-[#f7f8f4] text-[#839084]">
                                <tr>
                                  <th className="w-[23%] px-3 py-2">Field</th>
                                  <th className="w-[38%] px-3 py-2">
                                    Inventory before
                                  </th>
                                  <th className="w-[39%] px-3 py-2">
                                    Source after
                                  </th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-[#eceee8]">
                                {c.fields.map((f) => (
                                  <tr key={f.field}>
                                    <td className="px-3 py-2 font-bold">
                                      {f.field}
                                    </td>
                                    <td className="break-all px-3 py-2 font-mono text-[#a35a51]">
                                      {format(f.before)}
                                    </td>
                                    <td className="break-all px-3 py-2 font-mono text-[#56805e]">
                                      {format(f.after)}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
