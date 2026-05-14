"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, LockKeyhole, ShieldCheck } from "lucide-react";
import { toast as notify } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getSupabaseBrowser } from "@/lib/supabase/browser-client";

export function AdminLoginClient() {
  const router = useRouter();
  const supabase = React.useMemo(() => getSupabaseBrowser(), []);
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!supabase) {
      notify.error("Admin auth is not configured.");
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) {
        notify.error(error.message);
        return;
      }
      notify.success("Admin session started.");
      router.replace("/admin/blogs");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#050914] text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_12%,rgba(96,165,250,0.18),transparent_34%),radial-gradient(circle_at_82%_10%,rgba(45,212,191,0.12),transparent_30%)]" />
      <div className="relative mx-auto grid min-h-screen w-full max-w-6xl items-center gap-10 px-5 py-10 lg:grid-cols-[1fr_420px]">
        <section>
          <div className="flex size-12 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/15">
            <ShieldCheck className="size-6 text-blue-200" />
          </div>
          <p className="mt-8 text-xs font-semibold uppercase tracking-[0.24em] text-blue-200/80">
            Tulmin Internal CMS
          </p>
          <h1 className="mt-4 max-w-2xl text-4xl font-semibold tracking-tight sm:text-5xl">
            Secure publishing workspace for Tulmin content teams.
          </h1>
          <p className="mt-5 max-w-xl text-sm leading-7 text-slate-300">
            Customer SaaS users never see this surface. Admins manage drafts, SEO,
            publishing, and analytics from a separate internal system.
          </p>
        </section>

        <form
          onSubmit={submit}
          className="rounded-3xl border border-white/10 bg-white/[0.055] p-6 shadow-[0_24px_80px_-40px_rgba(37,99,235,0.8)] backdrop-blur-xl"
        >
          <div className="mb-6 flex items-center gap-3">
            <div className="flex size-11 items-center justify-center rounded-2xl bg-blue-500/15 text-blue-200 ring-1 ring-blue-300/20">
              <LockKeyhole className="size-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">Admin sign in</h2>
              <p className="text-xs text-slate-400">Allowed roles: super_admin, editor</p>
            </div>
          </div>

          <div className="space-y-4">
            <Input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="admin@tulmin.com"
              className="h-12 rounded-2xl border-white/10 bg-black/20 text-white placeholder:text-slate-500"
            />
            <Input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Password"
              className="h-12 rounded-2xl border-white/10 bg-black/20 text-white placeholder:text-slate-500"
            />
          </div>

          <Button type="submit" className="mt-6 h-12 w-full rounded-2xl" disabled={busy}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />}
            Enter Admin CMS
          </Button>

          <p className="mt-5 text-xs leading-6 text-slate-500">
            Access is verified again on every admin API request. If your email is
            not allowlisted in server env, login will not grant CMS permissions.
          </p>
        </form>
      </div>
    </main>
  );
}
