"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Activity,
  ArrowUpRight,
  Boxes,
  ChevronRight,
  Cloud,
  Database,
  History,
  Info,
  Layers3,
  LogOut,
  Menu,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
const navigation = [
  { href: "/", label: "Overview", icon: Activity },
  { href: "/sources", label: "Cloud sources", icon: Cloud },
  { href: "/inventory", label: "VM inventory", icon: Database },
  { href: "/sync", label: "Synchronization", icon: RefreshCw },
  { href: "/history", label: "Run history", icon: History },
];
function Brand() {
  return (
    <Link
      href="/"
      className="flex items-center gap-3 group"
      aria-label="IMPOC dashboard"
    >
      <span className="grid size-10 place-items-center rounded-xl bg-[#b77952] text-white shadow-lg shadow-[#b77952]/20 group-hover:rotate-3 transition-transform">
        <Layers3 size={21} strokeWidth={2.2} />
      </span>
      <span className="leading-tight">
        <span className="block text-[17px] font-extrabold tracking-[-.055em] text-white">
          IMPOC<span className="text-[#c69372]">.</span>
        </span>
        <span className="block text-[10px] font-semibold uppercase tracking-[.19em] text-[#aab0a9]">
          Inventory control
        </span>
      </span>
    </Link>
  );
}
function NavLinks({ path, close }: { path: string; close: () => void }) {
  return (
    <nav aria-label="Main navigation" className="space-y-1.5">
      {navigation.map(({ href, label, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          onClick={close}
          aria-current={path === href ? "page" : undefined}
          className={`group flex h-11 items-center gap-3 rounded-xl px-3.5 text-[13px] font-semibold transition-all ${path === href ? "bg-[#363b36] text-white shadow-inner shadow-black/10" : "text-[#a5aba4] hover:bg-white/7 hover:text-white"}`}
        >
          <Icon
            size={18}
            strokeWidth={1.9}
            className={
              path === href
                ? "text-[#d49a73]"
                : "text-[#747e76] group-hover:text-[#d49a73]"
            }
          />
          <span>{label}</span>
          {path === href && (
            <ChevronRight size={15} className="ml-auto text-[#b68b6e]" />
          )}
        </Link>
      ))}
    </nav>
  );
}
function SidebarContent({
  path,
  close,
  mode,
}: {
  path: string;
  close: () => void;
  mode: string;
}) {
  return (
    <div className="flex h-full flex-col px-4 py-6">
      <div className="px-2">
        <Brand />
      </div>
      <div className="mt-12 px-3 mb-3 text-[10px] font-bold uppercase tracking-[.22em] text-[#68736c]">
        Workspace
      </div>
      <NavLinks path={path} close={close} />
      <div className="mt-auto rounded-2xl border border-white/8 bg-white/4 p-4">
        <div className="flex items-center gap-2 text-[#d2d5d0] text-xs font-semibold">
          <span className="size-2 rounded-full bg-[#9cae88] shadow-[0_0_0_4px_rgba(156,174,136,.13)]" />
          Local workspace
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-[#8e978e]">
          {mode === "live"
            ? "Read-only live cloud discovery synchronized to centralized NetBox inventory."
            : "Simulated cloud providers synchronized to centralized NetBox inventory."}
        </p>
      </div>
      <div className="mt-5 px-2 flex items-center gap-2 text-[#68736c] text-[10px] font-medium">
        <ShieldCheck size={13} /> Operator console · v0.1
      </div>
    </div>
  );
}
export function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mode, setMode] = useState("unknown");
  useEffect(() => {
    if (path === "/access") return;
    fetch("/api/sync/jobs")
      .then((response) => (response.ok ? response.json() : null))
      .then((value) => {
        if (value?.sourceMode) setMode(value.sourceMode);
      })
      .catch(() => {});
  }, [path]);
  useEffect(() => {
    const expired = () => {
      router.replace("/access");
      router.refresh();
    };
    window.addEventListener("impoc:session-expired", expired);
    return () => window.removeEventListener("impoc:session-expired", expired);
  }, [router]);
  if (path === "/access") return <>{children}</>;
  async function logout() {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      router.replace("/access");
      router.refresh();
    }
  }
  return (
    <div className="min-h-screen console-canvas text-[#252924]">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[250px] bg-[#232923] lg:block">
        <SidebarContent path={path} close={() => {}} mode={mode} />
      </aside>
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent
          side="left"
          showCloseButton={false}
          className="w-[min(84vw,300px)] !bg-[#232923] p-0 border-0"
        >
          <SheetHeader className="sr-only">
            <SheetTitle>Navigation</SheetTitle>
          </SheetHeader>
          <SidebarContent
            path={path}
            close={() => setMobileOpen(false)}
            mode={mode}
          />
        </SheetContent>
      </Sheet>
      <div className="min-w-0 lg:pl-[250px]">
        <header className="sticky top-0 z-20 flex h-[72px] items-center justify-between gap-3 border-b border-[#e8e7e1] bg-[#faf9f6]/92 px-4 backdrop-blur-xl sm:px-7 lg:px-9">
          <div className="flex min-w-0 items-center gap-3">
            <Button
              size="icon"
              variant="ghost"
              className="lg:hidden"
              onClick={() => setMobileOpen(true)}
              aria-label="Open navigation"
            >
              <Menu size={19} />
            </Button>
            <span className="truncate text-sm font-bold text-[#303731]">
              IMPOC
            </span>
            <span className="hidden border-l border-[#dedfd8] pl-3 text-xs font-medium text-[#8c948a] sm:inline">
              Inventory control
            </span>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-2 rounded-full border border-[#e2e3dc] bg-white px-3 py-1.5 text-[11px] font-semibold text-[#62705e]">
              <span className="size-1.5 rounded-full bg-[#8da67a]" />{" "}
              {mode === "unknown"
                ? "Inventory active"
                : mode === "live"
                  ? "Live discovery"
                  : "Simulation active"}
            </div>
            <div className="hidden sm:block h-6 w-px bg-[#dedfd8]" />
            <button
              onClick={logout}
              className="flex items-center gap-2 rounded-lg px-2 py-2 text-xs font-bold text-[#727a70] hover:bg-[#efece6] hover:text-[#a65d39]"
              aria-label="Sign out"
            >
              <LogOut size={16} />
              <span className="hidden sm:inline">Sign out</span>
            </button>
            <div className="grid size-8 place-items-center rounded-full bg-[#efe3d9] text-[#a65d39] text-xs font-extrabold">
              OP
            </div>
          </div>
        </header>
        <main
          id="main-content"
          className="mx-auto min-w-0 max-w-[1500px] px-4 pb-14 pt-5 sm:px-7 lg:px-10"
        >
          <div className="page-enter">{children}</div>
        </main>
      </div>
    </div>
  );
}
export function PageHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <header className="mb-4 flex min-h-10 flex-wrap items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-1.5">
        <h1 className="min-w-0 font-display text-[22px] leading-tight font-extrabold text-[#242a24] sm:text-[24px]">
          {title}
        </h1>
        <Tooltip>
          <TooltipTrigger
            aria-label={`About ${title}`}
            className="grid size-7 shrink-0 place-items-center rounded-full text-[#818a80] transition-colors hover:bg-[#eeeee8] hover:text-[#4e6950] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#a65d39]"
          >
            <Info size={16} strokeWidth={1.8} />
          </TooltipTrigger>
          <TooltipContent
            side="bottom"
            align="start"
            className="max-w-[280px] bg-[#273229] px-3 py-2.5 text-left text-[12px] leading-relaxed text-white"
          >
            <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-[#c9a38d]">
              {eyebrow}
            </span>
            {description}
          </TooltipContent>
        </Tooltip>
      </div>
      <div className="flex items-center gap-2">
        {action && <div className="flex items-center">{action}</div>}
      </div>
    </header>
  );
}
export function Status({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "error" | "success";
}) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={`rounded-xl border p-3.5 text-sm leading-relaxed ${tone === "error" ? "border-[#f0d4cd] bg-[#fff5f2] text-[#9b4138]" : tone === "success" ? "border-[#d3e5d2] bg-[#f2f9f1] text-[#4c7550]" : "border-[#e8e5dc] bg-white text-[#737a72]"}`}
    >
      {children}
    </div>
  );
}
export function SectionTitle({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="text-[14px] font-extrabold tracking-tight text-[#2d342d]">
          {title}
        </h2>
        {description && (
          <p className="text-[11px] text-[#8b928a]">{description}</p>
        )}
      </div>
      {action}
    </div>
  );
}
export function ArrowLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1.5 text-xs font-bold text-[#a65d39] hover:text-[#84462a]"
    >
      {children}
      <ArrowUpRight size={14} />
    </Link>
  );
}
export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-4 py-14 text-center">
      <div className="mb-4 grid size-12 place-items-center rounded-2xl bg-[#f2eee8] text-[#a65d39]">
        <Boxes size={23} />
      </div>
      <h3 className="text-sm font-extrabold">{title}</h3>
      <p className="mt-1.5 max-w-sm text-xs leading-relaxed text-[#858c82]">
        {description}
      </p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
