"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Eye,
  EyeOff,
  Fingerprint,
  Layers3,
  LockKeyhole,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function AccessPage() {
  const router = useRouter();
  const [passcode, setPasscode] = useState("");
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passcode }),
      });
      if (!response.ok) {
        const result = await response.json();
        throw new Error(
          result.error?.message ??
            "Access denied. Check the passcode and try again.",
        );
      }
      setPasscode("");
      router.replace("/");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to sign in.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="min-h-screen bg-[#f8f7f3] text-[#252b26] lg:grid lg:grid-cols-[minmax(0,1.07fr)_minmax(420px,.93fr)]">
      <section className="relative hidden min-h-screen overflow-hidden bg-[#222a24] px-12 py-10 text-white lg:flex lg:flex-col xl:px-20">
        <div
          className="absolute inset-0 opacity-[.25]"
          style={{
            backgroundImage: "radial-gradient(#8d9d8b 1px, transparent 1px)",
            backgroundSize: "29px 29px",
          }}
        />
        <div className="absolute -right-24 top-1/4 size-[440px] rounded-full border border-[#647464]/30" />
        <div className="absolute -right-7 top-[30%] size-[330px] rounded-full border border-[#8b9c83]/40" />
        <div className="absolute right-14 top-[35%] size-[230px] rounded-full border border-[#bd8b6e]/50" />
        <div className="relative z-10 flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-xl bg-[#bd805b]">
            <Layers3 size={21} />
          </span>
          <span className="text-[20px] font-extrabold tracking-[-.06em]">
            IMPOC<span className="text-[#c69475]">.</span>
          </span>
          <span className="ml-3 border-l border-white/20 pl-4 text-[10px] font-bold uppercase tracking-[.2em] text-[#abb4ab]">
            Inventory control
          </span>
        </div>
        <div className="relative z-10 my-auto max-w-[620px] py-20">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[.17em] text-[#c5d0bf]">
            <span className="size-1.5 rounded-full bg-[#b2cb9b]" /> Local
            operator workspace
          </div>
          <h1 className="font-display text-[clamp(3.3rem,5vw,5.8rem)] leading-[.99] font-extrabold tracking-[-.075em]">
            One clear view.
            <br />
            <span className="text-[#c99370]">Every virtual machine.</span>
          </h1>
          <p className="mt-7 max-w-[490px] text-[15px] leading-[1.8] text-[#b0bbb0]">
            Explore source environments, inspect drift, and control what enters
            your inventory from one considered workspace.
          </p>
          <div className="mt-12 grid max-w-[470px] grid-cols-3 gap-4 border-t border-white/15 pt-6 text-xs text-[#9eaa9f]">
            <div>
              <span className="block text-2xl font-bold text-white">05</span>
              Providers
            </div>
            <div>
              <span className="block text-2xl font-bold text-white">01</span>
              Inventory
            </div>
            <div>
              <span className="block text-2xl font-bold text-white">100%</span>
              Local simulation
            </div>
          </div>
        </div>
        <div className="relative z-10 flex items-center gap-2 text-[11px] text-[#859387]">
          <ShieldCheck size={15} /> Private inventory workspace
          connection
        </div>
      </section>
      <section className="flex min-h-screen flex-col px-6 py-7 sm:px-12 lg:px-14 xl:px-24">
        <div className="flex items-center gap-2 lg:hidden">
          <span className="grid size-9 place-items-center rounded-lg bg-[#b77952] text-white">
            <Layers3 size={19} />
          </span>
          <span className="text-lg font-extrabold tracking-[-.05em]">
            IMPOC.
          </span>
        </div>
        <div className="mx-auto flex w-full max-w-[420px] flex-1 flex-col justify-center py-16">
          <div className="mb-8 grid size-14 place-items-center rounded-2xl border border-[#e6dfd4] bg-[#f0ebe3] text-[#a86540]">
            <Fingerprint size={28} strokeWidth={1.5} />
          </div>
          <div className="eyebrow mb-3">Secure access</div>
          <h2 className="font-display text-[38px] leading-tight font-extrabold tracking-[-.055em] sm:text-[44px]">
            Welcome to IMPOC.
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-[#7f877e]">
            Enter your workspace passcode to open the inventory console.
          </p>
          <form onSubmit={submit} className="mt-10">
            <label
              htmlFor="passcode"
              className="block text-xs font-bold text-[#424a42]"
            >
              Workspace passcode
            </label>
            <div className="relative mt-2">
              <LockKeyhole
                size={18}
                className="absolute left-4 top-1/2 -translate-y-1/2 text-[#919a90]"
              />
              <Input
                id="passcode"
                autoFocus
                autoComplete="current-password"
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
                type={visible ? "text" : "password"}
                value={passcode}
                onChange={(event) =>
                  setPasscode(event.target.value.replace(/\D/g, ""))
                }
                placeholder="Enter passcode"
                className="h-13 rounded-xl border-[#dddcd3] bg-white pl-11 pr-12 text-sm shadow-sm"
                required
              />
              <button
                type="button"
                onClick={() => setVisible(!visible)}
                aria-label={visible ? "Hide passcode" : "Show passcode"}
                className="absolute right-3 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-md text-[#8c948b] hover:bg-[#f2f0ea]"
              >
                {visible ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            </div>
            {error && (
              <p role="alert" className="mt-3 text-sm text-[#ad5145]">
                {error}
              </p>
            )}
            <Button
              disabled={busy || passcode.length !== 6}
              type="submit"
              className="mt-5 h-12 w-full justify-between rounded-xl bg-[#ad6946] px-5 text-sm font-bold text-white hover:bg-[#985838]"
            >
              {busy ? "Verifying…" : "Enter workspace"}
              <ArrowRight size={18} />
            </Button>
          </form>
          <div className="mt-8 flex items-start gap-2 border-t border-[#e6e4dc] pt-6 text-xs leading-relaxed text-[#90978e]">
            <ShieldCheck size={16} className="mt-0.5 shrink-0" />
            Access is controlled by a passcode configured on this local server.
          </div>
        </div>
        <div className="text-[11px] text-[#a0a59b]">
          IMPOC Inventory Control · Simulated environment
        </div>
      </section>
    </main>
  );
}
