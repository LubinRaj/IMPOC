"use client";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowUpRight, History as HistoryIcon } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  PageHeader,
  Status,
  EmptyState,
  SectionTitle,
} from "@/components/shell";
import {
  Pill,
  ProviderMark,
  TableFrame,
  DateText,
} from "@/components/console-ui";
import { api, fmt, type Run } from "@/components/api";
type Detail = Run & {
  scopes: {
    id: string;
    scopeId: string;
    scopeName: string;
    provider: string;
    collectionStatus: string;
    resultStatus: string;
    error: string | null;
    counts: Record<string, number>;
  }[];
  changes: {
    id: string;
    scopeId: string;
    externalId: string;
    kind: string;
    fields: { field: string; before: unknown; after: unknown }[];
    result: string;
  }[];
};
type SyncJob = {
  id: string;
  eventKey: string;
  trigger: string;
  status: string;
  attempts: number;
  lastError: string | null;
  createdAt: string;
  localRunId: string | null;
  netboxRunId: string | null;
};
function History() {
  const params = useSearchParams();
  const [runs, setRuns] = useState<Run[]>([]),
    [detail, setDetail] = useState<Detail | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [detailLoading, setDetailLoading] = useState(false),
    [jobs, setJobs] = useState<SyncJob[]>([]);
  useEffect(() => {
    api<Run[]>("/api/sync/runs")
      .then(setRuns)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => {
    const load = () =>
      api<{ jobs: SyncJob[] }>("/api/sync/jobs")
        .then((result) => setJobs(result.jobs))
        .catch((e) => setError(e.message));
    load();
    const timer = setInterval(load, 5000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    const id = params.get("run");
    if (id) {
      setDetailLoading(true);
      api<Detail>(`/api/sync/runs/${id}`)
        .then(setDetail)
        .catch((e) => setError(e.message))
        .finally(() => setDetailLoading(false));
    } else setDetail(null);
  }, [params]);
  function inspect(id: string) {
    history.replaceState(null, "", `?run=${id}`);
    setDetailLoading(true);
    api<Detail>(`/api/sync/runs/${id}`)
      .then(setDetail)
      .catch((e) => setError(e.message))
      .finally(() => setDetailLoading(false));
  }
  return (
    <>
      <PageHeader
        eyebrow="Audit / synchronization"
        title="Run history"
        description="A durable record of collection outcomes, inventory actions, and field-level changes."
      />
      {error && (
        <div className="mb-5">
          <Status tone="error">{error}</Status>
        </div>
      )}
      <SectionTitle
        title="Automatic sync"
        description="Source changes, events, and scheduled polls are processed by the sync worker."
      />
      <TableFrame>
        <div className="max-h-64 divide-y divide-[#eeeee8] overflow-y-auto">
          {jobs.slice(0, 12).map((job) => (
            <div
              key={job.id}
              className="flex flex-wrap items-center gap-2 px-4 py-3 text-xs sm:px-5"
            >
              <Pill value={job.status} />
              <span className="font-semibold">
                {job.trigger.replace("_", " ")}
              </span>
              <span
                className="min-w-0 flex-1 truncate font-mono text-[10px] text-[#879187]"
                title={job.eventKey}
              >
                {job.eventKey}
              </span>
              <span>
                {job.attempts} attempt{job.attempts === 1 ? "" : "s"}
              </span>
              {job.lastError && (
                <span className="w-full text-red-700">{job.lastError}</span>
              )}
            </div>
          ))}
          {!jobs.length && (
            <div className="p-5 text-xs text-[#8e978e]">
              No automatic jobs yet. Start the worker to process source changes
              and scheduled polls.
            </div>
          )}
        </div>
      </TableFrame>
      <div className="h-5" />
      <SectionTitle
        title="Completed runs"
        description={`${runs.length} recent synchronization runs`}
      />
      <TableFrame>
        <table className="hidden w-full min-w-[760px] table-fixed text-left text-xs md:table">
          <thead className="bg-[#f8f8f5] text-[10px] font-bold uppercase tracking-[.1em] text-[#929a91]">
            <tr>
              <th className="w-[27%] px-5 py-3.5">Run</th>
              <th className="w-[14%] px-4 py-3.5">Result</th>
              <th className="w-[11%] px-4 py-3.5">Created</th>
              <th className="w-[11%] px-4 py-3.5">Updated</th>
              <th className="w-[11%] px-4 py-3.5">Orphaned</th>
              <th className="w-[11%] px-4 py-3.5">Other</th>
              <th className="w-[15%] px-4 py-3.5">Details</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#eeeee8]">
            {runs.map((r) => (
              <tr key={r.id} className="hover:bg-[#fafaf7]">
                <td className="px-5 py-4">
                  <div className="font-bold">
                    {r.destination === "netbox"
                      ? "NetBox synchronization"
                      : "Local test run (legacy)"}
                  </div>
                  <div className="mt-1 font-mono text-[10px] text-[#9ca49a]">
                    {r.id.slice(0, 8)} · {fmt(r.startedAt)}
                  </div>
                </td>
                <td className="px-4 py-4">
                  <Pill value={r.status} />
                </td>
                <td className="px-4 py-4 font-bold">{r.counts.CREATE ?? 0}</td>
                <td className="px-4 py-4 font-bold">{r.counts.UPDATE ?? 0}</td>
                <td className="px-4 py-4 font-bold">
                  {r.counts.MARK_ORPHAN ?? 0}
                </td>
                <td className="px-4 py-4 font-bold">
                  {(r.counts.DECOMMISSION ?? 0) + (r.counts.RESTORE ?? 0)}
                </td>
                <td className="px-4 py-4">
                  <button
                    onClick={() => inspect(r.id)}
                    className="inline-flex items-center gap-1 text-xs font-bold text-[#a76643] hover:text-[#814b31]"
                  >
                    Inspect <ArrowUpRight size={14} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="divide-y divide-[#eeeee8] md:hidden">
          {runs.map((r) => (
            <button
              key={r.id}
              onClick={() => inspect(r.id)}
              className="flex w-full items-center gap-3 p-4 text-left"
            >
              <span className="grid size-10 place-items-center rounded-xl bg-[#f2f3ee] text-[#7a8a78]">
                <HistoryIcon size={18} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-xs font-bold">
                  {r.destination === "netbox"
                    ? "NetBox synchronization"
                    : "Local test run (legacy)"}
                </span>
                <span className="mt-1 block text-[11px] text-[#929a91]">
                  {fmt(r.startedAt)}
                </span>
                <span className="mt-1 block text-[10px] text-[#929a91]">
                  {r.counts.CREATE ?? 0} created · {r.counts.UPDATE ?? 0}{" "}
                  updated
                </span>
              </span>
              <Pill value={r.status} />
            </button>
          ))}
        </div>
        {loading && (
          <div className="p-6 text-xs text-[#8e978e]">Loading run history…</div>
        )}
        {!loading && !runs.length && (
          <EmptyState
            title="No synchronization runs"
            description="Completed previews and applies will appear here with their detailed results."
          />
        )}
      </TableFrame>
      <Sheet
        open={!!detail || detailLoading}
        onOpenChange={(open) => {
          if (!open) {
            setDetail(null);
            history.replaceState(null, "", "/history");
          }
        }}
      >
        <SheetContent side="right" className="record-drawer">
          <SheetHeader className="shrink-0 border-b border-[#e1e6de] bg-white px-5 py-5 pr-14 text-left sm:px-6 sm:pr-14">
            <div className="eyebrow mb-2">Run inspection</div>
            <SheetTitle className="record-value text-[22px] font-extrabold leading-tight tracking-tight text-[#263126]">
              {detail?.destination === "netbox"
                ? "NetBox synchronization details"
                : "Local test run details (legacy)"}
            </SheetTitle>
            <p className="record-value font-data text-[12px] leading-relaxed text-[#59685b]">
              {detail?.id ?? "Loading…"}
            </p>
          </SheetHeader>
          {detailLoading && !detail && (
            <div className="p-6 text-xs">Loading run details…</div>
          )}
          {detail && (
            <div className="record-drawer-body space-y-6 p-5 sm:p-6">
              <div className="flex flex-wrap items-center gap-3 rounded-xl border border-[#e8e9e1] bg-white p-4">
                <Pill value={detail.status} />
                <DateText value={detail.startedAt} />
                <span className="ml-auto text-xs text-[#929a91]">
                  {detail.changes.length} actions
                </span>
              </div>
              <section>
                <SectionTitle
                  title="Provider results"
                  description="Collection and apply outcomes for each environment"
                />
                <div className="grid gap-2 sm:grid-cols-2">
                  {detail.scopes.map((s) => (
                    <div
                      key={s.id}
                      className="rounded-xl border border-[#e8e9e1] bg-white p-4"
                    >
                      <div className="flex items-center gap-2">
                        <ProviderMark provider={s.provider} />
                        <div className="min-w-0">
                          <div className="truncate text-xs font-bold">
                            {s.scopeName}
                          </div>
                          <div className="text-[10px] uppercase text-[#9aa198]">
                            {s.provider}
                          </div>
                        </div>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Pill value={s.resultStatus} />
                        <Pill value={s.collectionStatus} />
                      </div>
                      {s.error && (
                        <p className="mt-3 text-[11px] leading-relaxed text-[#a95143]">
                          {s.error}
                        </p>
                      )}
                      <p className="mt-3 text-[10px] leading-relaxed text-[#929a91]">
                        {Object.entries(s.counts)
                          .filter(([, v]) => v > 0)
                          .map(([k, v]) => `${k.replaceAll("_", " ")}: ${v}`)
                          .join(" · ") || "No inventory actions"}
                      </p>
                    </div>
                  ))}
                </div>
              </section>
              <section>
                <SectionTitle
                  title="Inventory actions"
                  description="Recorded field and lifecycle changes"
                />
                {detail.changes.length ? (
                  <div className="space-y-2">
                    {detail.changes.map((c) => (
                      <details
                        key={c.id}
                        className="group rounded-xl border border-[#e8e9e1] bg-white p-4"
                      >
                        <summary className="flex cursor-pointer list-none flex-wrap items-center gap-2 text-xs">
                          <Pill value={c.kind} />
                          <span className="min-w-0 flex-1 break-all font-mono text-[11px] font-bold">
                            {c.externalId}
                          </span>
                          <span className="text-[10px] text-[#929a91]">
                            {c.result}
                          </span>
                          <ArrowUpRight size={14} className="text-[#a7aea5]" />
                        </summary>
                        {c.fields.length ? (
                          <div className="mt-3 overflow-auto rounded-lg border border-[#ecece5]">
                            <table className="w-full min-w-[430px] text-left text-[11px]">
                              <thead className="bg-[#f8f8f5] text-[#8d978c]">
                                <tr>
                                  <th className="p-2">Field</th>
                                  <th className="p-2">Before</th>
                                  <th className="p-2">After</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-[#eeeee8]">
                                {c.fields.map((f) => (
                                  <tr key={f.field}>
                                    <td className="p-2 font-bold">{f.field}</td>
                                    <td className="break-all p-2 font-mono text-[#a35a51]">
                                      {JSON.stringify(f.before) ?? "—"}
                                    </td>
                                    <td className="break-all p-2 font-mono text-[#56805e]">
                                      {JSON.stringify(f.after) ?? "—"}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        ) : (
                          <p className="mt-3 text-[11px] text-[#90998f]">
                            Lifecycle or creation action; no field drift
                            recorded.
                          </p>
                        )}
                      </details>
                    ))}
                  </div>
                ) : (
                  <EmptyState
                    title="No inventory actions"
                    description={
                      detail.status === "failed"
                        ? "The run failed before any destination change was confirmed."
                        : "The run finished without destination changes."
                    }
                  />
                )}
              </section>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
export default function HistoryPage() {
  return (
    <Suspense fallback={<Status>Loading history…</Status>}>
      <History />
    </Suspense>
  );
}
