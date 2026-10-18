"use client";

import { Pencil, Trash2 } from "lucide-react";
import type { Source } from "@/components/api";
import { ProviderMark, Pill } from "@/components/console-ui";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type Props = {
  source: Source | null;
  readOnly?: boolean;
  busy: boolean;
  onClose: () => void;
  onEdit: (source: Source) => void;
  onRemove: (source: Source) => void;
};

function Field({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="grid gap-1 border-b border-[#e9ece5] py-3 last:border-0 sm:grid-cols-[140px_minmax(0,1fr)] sm:gap-4">
      <dt className="text-[12px] font-semibold text-[#697669]">{label}</dt>
      <dd
        className={`record-value min-w-0 text-[13px] font-semibold leading-relaxed text-[#283329] ${mono ? "font-data" : ""}`}
      >
        {value ?? "—"}
      </dd>
    </div>
  );
}

function Group({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-[#e1e6de] bg-white px-4 py-1 sm:px-5">
      <h3 className="border-b border-[#e9ece5] py-3 text-[12px] font-extrabold uppercase tracking-[.08em] text-[#657665]">
        {title}
      </h3>
      <dl>{children}</dl>
    </section>
  );
}

function NativeValue({ value }: { value: unknown }) {
  if (value === null || value === undefined)
    return <span className="text-[#8b968b]">—</span>;
  if (typeof value === "object") {
    return (
      <pre className="record-value whitespace-pre-wrap font-data text-[12px] leading-[1.7] text-[#26382c]">
        {JSON.stringify(value, null, 2)}
      </pre>
    );
  }
  return (
    <span className="record-value font-data text-[12px] leading-relaxed text-[#26382c]">
      {String(value)}
    </span>
  );
}

export function SourceDetailDrawer({
  source,
  readOnly = false,
  busy,
  onClose,
  onEdit,
  onRemove,
}: Props) {
  return (
    <Sheet
      open={!!source}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <SheetContent
        side="right"
        className="record-drawer"
        aria-label={
          source
            ? `${source.normalized.hostname} source details`
            : "Source details"
        }
      >
        <SheetHeader className="shrink-0 border-b border-[#e1e6de] bg-white px-5 py-5 pr-14 text-left sm:px-6 sm:pr-14">
          <div className="mb-2 flex items-center gap-2.5">
            <ProviderMark provider={source?.provider ?? ""} />
            <span className="text-[11px] font-bold uppercase tracking-[.08em] text-[#687568]">
              {source?.provider.toUpperCase()} · {source?.scopeName}
            </span>
          </div>
          <SheetTitle className="record-value text-[22px] font-extrabold leading-tight tracking-tight text-[#263126]">
            {source?.normalized.hostname}
          </SheetTitle>
          <SheetDescription className="record-value font-data text-[12px] leading-relaxed text-[#59685b]">
            {source?.externalId}
          </SheetDescription>
        </SheetHeader>
        {source && (
          <>
            <div className="record-drawer-body px-4 py-5 sm:px-6">
              <Tabs
                key={source.id}
                defaultValue="summary"
                className="record-tabs min-w-0"
              >
                <TabsList variant="line" className="w-full">
                  <TabsTrigger value="summary">Overview</TabsTrigger>
                  <TabsTrigger value="native">Native record</TabsTrigger>
                </TabsList>
                <TabsContent value="summary" className="space-y-4">
                  <div className="flex items-center gap-2">
                    <Pill value={source.normalized.powerState} />
                    <span className="text-[12px] text-[#697669]">
                      {readOnly
                        ? "Live provider discovery"
                        : "Simulated provider record"}
                    </span>
                  </div>
                  <Group title="Identity & network">
                    <Field
                      label="Hostname"
                      value={source.normalized.hostname}
                    />
                    <Field
                      label="Native resource ID"
                      value={source.externalId}
                      mono
                    />
                    <Field
                      label="IP addresses"
                      value={source.normalized.ipAddresses.join(", ") || "—"}
                      mono
                    />
                    <Field
                      label="Operating system"
                      value={source.normalized.operatingSystem}
                    />
                  </Group>
                  <Group title="Compute & placement">
                    <Field
                      label="CPU cores"
                      value={source.normalized.cpuCores}
                    />
                    <Field
                      label="Memory"
                      value={
                        source.normalized.memoryMB == null
                          ? "—"
                          : `${(source.normalized.memoryMB / 1024).toFixed(1)} GB`
                      }
                    />
                    <Field
                      label="Disk"
                      value={
                        source.normalized.diskGB == null
                          ? "—"
                          : `${source.normalized.diskGB} GB`
                      }
                    />
                    <Field
                      label="Region / zone"
                      value={source.normalized.region}
                    />
                    <Field
                      label="Cluster / node"
                      value={source.normalized.cluster}
                    />
                  </Group>
                  <Group title="Ownership & tags">
                    <Field label="Owner" value={source.normalized.owner} />
                    <Field
                      label="Tags"
                      value={
                        Object.entries(source.normalized.tags).length ? (
                          <div className="flex flex-wrap gap-1.5">
                            {Object.entries(source.normalized.tags).map(
                              ([key, value]) => (
                                <span
                                  key={key}
                                  className="rounded-md border border-[#dce5d9] bg-[#f4f8f1] px-2 py-1 font-data text-[11px] text-[#426344]"
                                >
                                  {key}: {value}
                                </span>
                              ),
                            )}
                          </div>
                        ) : (
                          "—"
                        )
                      }
                    />
                  </Group>
                </TabsContent>
                <TabsContent value="native" className="space-y-3">
                  <p className="text-[12px] leading-relaxed text-[#647264]">
                    Provider-specific fields captured by the collector.
                  </p>
                  <div className="overflow-hidden rounded-xl border border-[#e1e6de] bg-white">
                    {Object.entries(source.nativePayload).map(
                      ([key, value]) => (
                        <div
                          key={key}
                          className="grid gap-1 border-b border-[#e9ece5] px-4 py-3 last:border-0 sm:grid-cols-[160px_minmax(0,1fr)] sm:gap-4 sm:px-5"
                        >
                          <span className="record-value font-data text-[12px] font-semibold text-[#516653]">
                            {key}
                          </span>
                          <NativeValue value={value} />
                        </div>
                      ),
                    )}
                  </div>
                </TabsContent>
              </Tabs>
            </div>
            {!readOnly && (
              <div className="flex shrink-0 flex-wrap gap-2 border-t border-[#e1e6de] bg-white px-4 py-3 sm:px-6">
                <Button
                  onClick={() => onEdit(source)}
                  className="bg-[#ae6946] text-white hover:bg-[#975638]"
                >
                  <Pencil size={15} /> Edit source
                </Button>
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() => onRemove(source)}
                >
                  <Trash2 size={15} /> Remove
                </Button>
              </div>
            )}
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
