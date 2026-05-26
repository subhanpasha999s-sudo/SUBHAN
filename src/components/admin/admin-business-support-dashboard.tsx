"use client";

import * as React from "react";

import Link from "next/link";
import { Loader2, LockKeyhole, MessageSquareReply, RefreshCw, Send } from "lucide-react";
import { toast as notify } from "sonner";

import { AdminNav } from "@/components/admin/admin-nav";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { BusinessTicket } from "@/lib/business-support/tickets";

type Payload = {
  tickets: BusinessTicket[];
};

function formatDate(value: string | null) {
  if (!value) return "No activity";
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function statusTone(status: BusinessTicket["status"]) {
  if (status === "user_replied" || status === "open") return "bg-amber-300/10 text-amber-100 ring-amber-300/20";
  if (status === "admin_replied") return "bg-emerald-300/10 text-emerald-100 ring-emerald-300/20";
  return "bg-white/10 text-slate-300 ring-white/10";
}

function statusLabel(status: BusinessTicket["status"]) {
  if (status === "admin_replied") return "Admin replied";
  if (status === "user_replied") return "Needs reply";
  if (status === "closed") return "Closed";
  return "Open";
}

export function AdminBusinessSupportDashboard() {
  const [tickets, setTickets] = React.useState<BusinessTicket[]>([]);
  const [selectedId, setSelectedId] = React.useState<number | null>(null);
  const [reply, setReply] = React.useState("");
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState("");
  const selected = tickets.find((ticket) => ticket.id === selectedId) ?? tickets[0] ?? null;

  const load = React.useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/business-support", { cache: "no-store" });
      const json = (await res.json().catch(() => null)) as (Payload & { error?: string }) | null;
      if (!res.ok) throw new Error(json?.error || "Could not load business messages.");
      const nextTickets = Array.isArray(json?.tickets) ? json.tickets : [];
      setTickets(nextTickets);
      setSelectedId((current) => current ?? nextTickets[0]?.id ?? null);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not load business messages.";
      setError(message);
      notify.error(message);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  async function updateTicket(status?: "open" | "closed") {
    if (!selected) return;
    const body = reply.trim();
    if (!body && !status) {
      notify.error("Write a reply before sending.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/admin/business-support", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticketId: selected.id, message: body || undefined, status }),
      });
      const json = (await res.json().catch(() => null)) as (Payload & { error?: string }) | null;
      if (!res.ok) throw new Error(json?.error || "Could not update ticket.");
      setTickets(Array.isArray(json?.tickets) ? json.tickets : []);
      setReply("");
      notify.success(status === "closed" ? "Ticket closed" : body ? "Reply sent" : "Ticket updated");
    } catch (err) {
      notify.error(err instanceof Error ? err.message : "Could not update ticket.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#070a0f] text-white">
      <header className="border-b border-white/10 bg-[#0b0f17]/95 px-4 py-3 backdrop-blur sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#8fa8ff]">Tulmin Admin</p>
            <h1 className="mt-1 text-xl font-semibold tracking-tight text-white">Business messages</h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <AdminNav />
            <Button className="h-9 rounded-md" variant="secondary" disabled={loading} onClick={() => void load()}>
              {loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <RefreshCw className="size-4" aria-hidden />}
              Refresh
            </Button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-5">
          <h2 className="text-2xl font-semibold tracking-tight">Business support queue</h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-400">
            Read business user requests, review their account details, and reply inside the same ticket thread.
          </p>
        </div>

        {loading ? (
          <div className="grid gap-4 lg:grid-cols-[23rem_1fr]">
            <div className="h-96 animate-pulse rounded-lg border border-white/10 bg-white/[0.06]" />
            <div className="h-96 animate-pulse rounded-lg border border-white/10 bg-white/[0.06]" />
          </div>
        ) : error ? (
          <div className="rounded-lg border border-red-400/20 bg-[#1a0f13] p-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-md border border-red-400/20 bg-red-400/10 text-red-100">
                  <LockKeyhole className="size-5" aria-hidden />
                </span>
                <div>
                  <h3 className="text-sm font-semibold text-red-50">{error}</h3>
                  <p className="mt-1 max-w-2xl text-sm leading-6 text-red-100/62">
                    Apply the business support migration and sign in with an allowlisted admin account.
                  </p>
                </div>
              </div>
              <Link className="inline-flex h-9 items-center justify-center rounded-md bg-[#335cff] px-3 text-sm font-semibold text-white" href="/admin/login">
                Admin login
              </Link>
            </div>
          </div>
        ) : tickets.length === 0 ? (
          <div className="rounded-lg border border-white/10 bg-[#0f151f] p-8 text-center">
            <MessageSquareReply className="mx-auto size-10 text-slate-500" aria-hidden />
            <h3 className="mt-4 text-lg font-semibold">No business tickets yet</h3>
            <p className="mt-1 text-sm text-slate-500">Messages from Business users will appear here.</p>
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-[23rem_1fr] lg:items-start">
            <aside className="overflow-hidden rounded-lg border border-white/10 bg-[#0f151f]">
              {tickets.map((ticket) => (
                <button
                  key={ticket.id}
                  type="button"
                  className={cn(
                    "block w-full border-b border-white/10 p-4 text-left transition-colors last:border-b-0 hover:bg-white/[0.05]",
                    selected?.id === ticket.id && "bg-white/[0.07]"
                  )}
                  onClick={() => setSelectedId(ticket.id)}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-white">{ticket.userEmail}</p>
                      <p className="mt-1 truncate text-xs text-slate-500">{ticket.company || ticket.userName || "No company added"}</p>
                    </div>
                    <span className={cn("shrink-0 rounded-md px-2 py-1 text-[11px] font-bold ring-1", statusTone(ticket.status))}>
                      {statusLabel(ticket.status)}
                    </span>
                  </div>
                  <p className="mt-3 line-clamp-2 text-xs leading-5 text-slate-400">
                    {ticket.messages.at(-1)?.body ?? ticket.subject}
                  </p>
                  <p className="mt-2 text-[11px] font-semibold text-slate-600">{formatDate(ticket.updatedAt)}</p>
                </button>
              ))}
            </aside>

            {selected ? (
              <section className="rounded-lg border border-white/10 bg-[#0f151f]">
                <div className="border-b border-white/10 p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <h3 className="text-lg font-semibold">{selected.subject}</h3>
                      <p className="mt-1 text-sm text-slate-500">{selected.userEmail}</p>
                    </div>
                    <Badge className={cn("w-fit ring-1", statusTone(selected.status))}>{statusLabel(selected.status)}</Badge>
                  </div>
                  <div className="mt-4 grid gap-2 text-sm sm:grid-cols-2 xl:grid-cols-4">
                    <div className="rounded-md border border-white/10 bg-black/20 p-3">
                      <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">Name</p>
                      <p className="mt-1 truncate font-semibold">{selected.userName || "Not added"}</p>
                    </div>
                    <div className="rounded-md border border-white/10 bg-black/20 p-3">
                      <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">Company</p>
                      <p className="mt-1 truncate font-semibold">{selected.company || "Not added"}</p>
                    </div>
                    <div className="rounded-md border border-white/10 bg-black/20 p-3">
                      <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">Plan</p>
                      <p className="mt-1 truncate font-semibold capitalize">{selected.plan}</p>
                    </div>
                    <div className="rounded-md border border-white/10 bg-black/20 p-3">
                      <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">Updated</p>
                      <p className="mt-1 truncate font-semibold">{formatDate(selected.updatedAt)}</p>
                    </div>
                  </div>
                </div>

                <div className="max-h-[34rem] space-y-3 overflow-y-auto p-4">
                  {selected.messages.map((message) => (
                    <div
                      key={message.id}
                      className={cn(
                        "max-w-[84%] rounded-lg border px-3 py-2 text-sm",
                        message.senderType === "admin"
                          ? "ml-auto border-[#7d8cff]/20 bg-[#335cff]/15"
                          : "border-white/10 bg-black/20"
                      )}
                    >
                      <div className="mb-1 flex flex-wrap items-center justify-between gap-2 text-[11px] font-semibold text-slate-500">
                        <span>{message.senderType === "admin" ? "Admin" : selected.userEmail}</span>
                        <span>{formatDate(message.createdAt)}</span>
                      </div>
                      <p className="whitespace-pre-wrap leading-relaxed text-slate-100">{message.body}</p>
                    </div>
                  ))}
                </div>

                <div className="border-t border-white/10 p-4">
                  <textarea
                    value={reply}
                    onChange={(event) => setReply(event.target.value)}
                    placeholder="Write a reply..."
                    className="min-h-28 w-full resize-y rounded-md border border-white/10 bg-black/25 px-3 py-3 text-sm text-white outline-none placeholder:text-slate-600 focus:border-[#7d8cff]/60"
                    maxLength={5000}
                  />
                  <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-xs text-slate-500">{reply.length.toLocaleString("en-IN")} / 5,000</p>
                    <div className="flex flex-wrap gap-2 sm:justify-end">
                      <Button className="h-10 rounded-md" variant="secondary" disabled={saving || selected.status === "closed"} onClick={() => void updateTicket("closed")}>
                        Close ticket
                      </Button>
                      <Button className="h-10 rounded-md" disabled={saving || selected.status === "closed"} onClick={() => void updateTicket()}>
                        {saving ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Send className="size-4" aria-hidden />}
                        Reply
                      </Button>
                    </div>
                  </div>
                </div>
              </section>
            ) : null}
          </div>
        )}
      </div>
    </main>
  );
}
