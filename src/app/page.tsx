"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  Cloud,
  Database,
  RefreshCw,
  ShieldAlert,
  Activity,
  CheckCircle2,
} from "lucide-react";
import {
  PageHeader,
  Status,
  SectionTitle,
  EmptyState,
} from "@/components/shell";
import { ProviderMark, Pill } from "@/components/console-ui";
import { api, fmt, type Scope, type Run } from "@/components/api";
type Dashboard = {
  sourceMode: "simulation" | "live";
  netbox: { status: "connected" | "unavailable"; error: string | null };
  scopes: Scope[];
  sourceCount: number | null;
  inventoryCount: number | null;
  lifecycle: Record<string, number> | null;
  latestRuns: Run[];
};
export default function Home() {
  const [data, setData] = useState<Dashboard | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    api<Dashboard>("/api/dashboard")
      .then(setData)
      .catch((e) => setError(e.message));
  }, []);
  const metrics = data
    ? [
        {
          name: "Source machines",
          value: data.sourceCount ?? "—",
          icon: Cloud,
          detail:
            data.sourceMode === "live"
              ? "Browse live discovery in Cloud sources"
              : "Across simulated providers",
        },
        {
          name: "NetBox inventory",
          value: data.inventoryCount ?? "—",
          icon: Database,
          detail: "Centralized VM records",
        },
        {
          name: "Needs attention",
          value:
            data.lifecycle?.orphaned ??
            (data.netbox.status === "connected" ? 0 : "—"),
          icon: ShieldAlert,
          detail: "Orphaned records",
        },
        {
          name: "Decommissioned",
          value:
            data.lifecycle?.decommissioned ??
            (data.netbox.status === "connected" ? 0 : "—"),
          icon: RefreshCw,
          detail: "Soft lifecycle state",
        },
      ]
    : [];
  return (
    <>
      <PageHeader
        eyebrow="Control center / overview"
        title="Inventory overview"
        description="Source environments, NetBox inventory, and synchronization activity."
        action={
          <Link
            href="/sync"
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#ae6946] px-4 text-xs font-bold text-white shadow-sm hover:bg-[#975638]"
          >
            Review changes <ArrowUpRight size={15} />
          </Link>
        }
      />
      {error && <Status tone="error">{error}</Status>}
      {data?.netbox.status === "unavailable" && (
        <Status tone="error">
          NetBox inventory is unavailable. {data.netbox.error} Source records
          and sync history remain available; queued jobs will retry.
        </Status>
      )}
      {!data && !error && <Status>Loading workspace overview…</Status>}
      {data && (
        <>
          <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {metrics.map(({ name, value, icon: Icon, detail }) => (
              <div
                key={name}
                className="surface relative overflow-hidden p-5 sm:p-6"
              >
                <div className="flex items-start justify-between">
                  <span className="text-xs font-semibold text-[#818a81]">
                    {name}
                  </span>
                  <span className="grid size-9 place-items-center rounded-xl bg-[#f4f2ec] text-[#9d684b]">
                    <Icon size={17} />
                  </span>
                </div>
                <div className="mt-3 font-display text-[34px] font-extrabold leading-none tracking-[-.05em] text-[#2d342d]">
                  {value}
                </div>
                <p className="mt-3 text-[11px] text-[#9aa198]">{detail}</p>
              </div>
            ))}
          </div>
          <div className="mb-6 grid gap-5 xl:grid-cols-[1.7fr_1fr]">
            <section className="surface p-5 sm:p-6">
              <SectionTitle
                title="Provider environments"
                description={`${data.scopes.length} collection scopes across five ${data.sourceMode === "live" ? "live" : "simulated"} providers`}
                action={
                  <Link
                    href="/sources"
                    className="text-xs font-bold text-[#9d6040] hover:underline"
                  >
                    View sources <ArrowRight size={13} className="inline" />
                  </Link>
                }
              />
              <div className="divide-y divide-[#eeeee8]">
                {data.scopes.map((s) => (
                  <div
                    key={s.id}
                    className="flex flex-wrap items-center gap-3 py-3.5 first:pt-1 last:pb-0"
                  >
                    <ProviderMark provider={s.provider} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px] font-bold text-[#384038]">
                        {s.name}
                      </div>
                      <div className="mt-0.5 text-[11px] text-[#9aa198]">
                        {s.environment} · {s.provider.toUpperCase()}
                      </div>
                    </div>
                    <div className="hidden text-right sm:block">
                      <div className="text-[13px] font-extrabold">
                        {data.sourceMode === "live" ? "—" : s.sourceCount}
                      </div>
                      <div className="text-[10px] text-[#9aa198]">
                        source VMs
                      </div>
                    </div>
                    <div className="hidden text-right sm:block">
                      <div className="text-[13px] font-extrabold">
                        {s.inventoryCount ?? "—"}
                      </div>
                      <div className="text-[10px] text-[#9aa198]">
                        inventory
                      </div>
                    </div>
                    <Pill
                      value={
                        data.sourceMode === "live" ? "live" : s.simulationMode
                      }
                    />
                  </div>
                ))}
              </div>
            </section>
            <div className="flex flex-col gap-5">
              <section className="relative overflow-hidden rounded-2xl bg-[#283228] p-6 text-white">
                <div className="absolute -right-12 -top-12 size-44 rounded-full border border-white/10" />
                <div className="absolute -right-2 -top-2 size-32 rounded-full border border-white/10" />
                <div className="relative">
                  <span className="grid size-10 place-items-center rounded-xl bg-white/10 text-[#d7aa8b]">
                    <Activity size={20} />
                  </span>
                  <div className="mt-7 text-[11px] font-bold uppercase tracking-[.18em] text-[#acb9a9]">
                    Controlled synchronization
                  </div>
                  <h2 className="mt-2 max-w-[240px] font-display text-[23px] font-extrabold leading-tight tracking-tight">
                    See every change before it lands.
                  </h2>
                  <p className="mt-3 max-w-[290px] text-xs leading-relaxed text-[#aebcaf]">
                    Preview creates, field drift, and lifecycle changes. Manual
                    review remains available alongside automatic sync.
                  </p>
                  <Link
                    href="/sync"
                    className="mt-6 inline-flex items-center gap-2 rounded-lg bg-[#c3845f] px-4 py-2.5 text-xs font-bold text-white hover:bg-[#ae704d]"
                  >
                    Start a preview <ArrowRight size={15} />
                  </Link>
                </div>
              </section>
              <section className="surface flex items-start gap-3 p-5">
                <span className="grid size-9 place-items-center rounded-xl bg-[#eef4e8] text-[#72906b]">
                  <CheckCircle2 size={18} />
                </span>
                <div>
                  <h3 className="text-xs font-extrabold">
                    {data.sourceMode === "live"
                      ? "Live cloud discovery"
                      : "Simulation environment"}
                  </h3>
                  <p className="mt-1 text-[11px] leading-relaxed text-[#8e978e]">
                    {data.sourceMode === "live"
                      ? "Configured cloud collectors are read-only. Check run history for connection and collection outcomes."
                      : "Cloud sources are simulated; NetBox stores the centralized VM inventory."}
                  </p>
                </div>
              </section>
            </div>
          </div>
          <section className="surface p-5 sm:p-6">
            <SectionTitle
              title="Recent activity"
              description="Latest synchronization runs"
              action={
                <Link
                  href="/history"
                  className="text-xs font-bold text-[#9d6040] hover:underline"
                >
                  Full history <ArrowRight size={13} className="inline" />
                </Link>
              }
            />
            {data.latestRuns.length ? (
              <div className="divide-y divide-[#eeeee8]">
                {data.latestRuns.map((r) => (
                  <Link
                    href={`/history?run=${r.id}`}
                    key={r.id}
                    className="group flex flex-wrap items-center gap-3 py-3 first:pt-1 last:pb-0"
                  >
                    <span className="grid size-8 place-items-center rounded-lg bg-[#f2f3ee] text-[#7a8a78]">
                      <RefreshCw size={15} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-bold">
                        {r.destination === "netbox"
                          ? "NetBox synchronization"
                          : "Local test run (legacy)"}
                      </div>
                      <div className="mt-0.5 text-[11px] text-[#9aa198]">
                        {fmt(r.startedAt)}
                      </div>
                    </div>
                    <Pill value={r.status} />
                    <ArrowUpRight
                      size={15}
                      className="text-[#a7afa5] group-hover:text-[#ad6946]"
                    />
                  </Link>
                ))}
              </div>
            ) : (
              <EmptyState
                title="No synchronization runs yet"
                description="Preview and apply your first plan to start the activity trail."
                action={
                  <Link
                    href="/sync"
                    className="text-xs font-bold text-[#a96542]"
                  >
                    Go to synchronization →
                  </Link>
                }
              />
            )}
          </section>
        </>
      )}
    </>
  );
}
