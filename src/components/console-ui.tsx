import {
  ArrowUpRight,
  Cpu,
  HardDrive,
  MemoryStick,
  Server,
} from "lucide-react";
import { fmt } from "@/components/api";

const providerTone: Record<string, string> = {
  aws: "bg-[#f5e9d9] text-[#a76632]",
  azure: "bg-[#e3eef4] text-[#42748c]",
  gcp: "bg-[#e9e8f4] text-[#645f9a]",
  vmware: "bg-[#e3ede7] text-[#477960]",
  proxmox: "bg-[#f4e8e2] text-[#a76c50]",
};
export function ProviderMark({ provider }: { provider: string }) {
  return (
    <span
      className={`inline-grid size-9 shrink-0 place-items-center rounded-[10px] text-[10px] font-extrabold uppercase tracking-tight ${providerTone[provider] ?? "bg-[#ecece7] text-[#596158]"}`}
    >
      {provider === "proxmox"
        ? "PX"
        : provider === "vmware"
          ? "VM"
          : provider === "azure"
            ? "AZ"
            : provider === "aws"
              ? "AW"
              : "GC"}
    </span>
  );
}
export function Pill({ value }: { value: string }) {
  const tone =
    value === "active" ||
    value === "complete" ||
    value === "completed" ||
    value === "running" ||
    value === "ok" ||
    value === "applied"
      ? "bg-[#e9f2e7] text-[#4d7851] border-[#d9e8d6]"
      : value === "failed" || value === "decommissioned"
        ? "bg-[#f9eae6] text-[#a95043] border-[#f0d9d3]"
        : value === "partial" || value === "orphaned"
          ? "bg-[#f7efdd] text-[#9d7435] border-[#eee1bd]"
          : "bg-[#f0f1ed] text-[#6e776d] border-[#e5e8e1]";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-bold capitalize tracking-[.02em] ${tone}`}
    >
      <span className="size-1.5 rounded-full bg-current opacity-70" />
      {value.replaceAll("_", " ").toLowerCase()}
    </span>
  );
}
export function Spec({
  cpu,
  memory,
  disk,
}: {
  cpu: number | null;
  memory: number | null;
  disk?: number | null;
}) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-[#758076]">
      <span className="inline-flex items-center gap-1">
        <Cpu size={13} />
        {cpu ?? "—"} CPU
      </span>
      <span className="inline-flex items-center gap-1">
        <MemoryStick size={13} />
        {memory == null ? "—" : `${Math.round(memory / 1024)} GB`} RAM
      </span>
      {disk !== undefined && (
        <span className="inline-flex items-center gap-1">
          <HardDrive size={13} />
          {disk ?? "—"} GB disk
        </span>
      )}
    </div>
  );
}
export function DetailRow({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="grid gap-1 border-b border-[#e5e9e2] py-3 last:border-0 sm:grid-cols-[140px_minmax(0,1fr)] sm:gap-4">
      <dt className="text-[12px] font-semibold text-[#667566]">{label}</dt>
      <dd
        className={`record-value min-w-0 text-[13px] font-semibold leading-relaxed text-[#29352a] ${mono ? "font-data" : ""}`}
      >
        {value ?? "—"}
      </dd>
    </div>
  );
}
export function TableFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="surface overflow-hidden">
      <div className="data-scroll">{children}</div>
    </div>
  );
}
export function VmGlyph() {
  return (
    <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-[#e5e9df] bg-[#f1f4ec] text-[#6b8066]">
      <Server size={19} />
    </span>
  );
}
export function DetailLink({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-1 text-xs font-bold text-[#9d6040] hover:text-[#79472f]"
    >
      Inspect <ArrowUpRight size={14} />
    </button>
  );
}
export function DateText({ value }: { value: string | null | undefined }) {
  return <span className="text-xs text-[#727b72]">{fmt(value)}</span>;
}
