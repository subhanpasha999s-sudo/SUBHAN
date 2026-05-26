"use client";

import * as React from "react";

import { Loader2, MessageSquareReply, Send } from "lucide-react";
import { toast as notify } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getSupabaseBrowser } from "@/lib/supabase/browser-client";
import { cn } from "@/lib/utils";
import type { BusinessTicket } from "@/lib/business-support/tickets";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function statusLabel(status: BusinessTicket["status"]) {
  if (status === "admin_replied") return "Admin replied";
  if (status === "user_replied") return "Awaiting admin";
  if (status === "closed") return "Closed";
  return "Open";
}

export function BusinessSupportPanel({ enabled }: { enabled: boolean }) {
  const [tickets, setTickets] = React.useState<BusinessTicket[]>([]);
  const [message, setMessage] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [sending, setSending] = React.useState(false);
  const activeTicket = tickets.find((ticket) => ticket.status !== "closed") ?? tickets[0] ?? null;

  const load = React.useCallback(async () => {
    if (!enabled) return;
    const sb = getSupabaseBrowser();
    if (!sb) return;
    setLoading(true);
    try {
      const { data } = await sb.auth.getSession();
      const token = data.session?.access_token;
      if (!token) return;
      const res = await fetch("/api/business-support", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const json = (await res.json().catch(() => null)) as { tickets?: BusinessTicket[]; error?: string } | null;
      if (!res.ok) throw new Error(json?.error || "Could not load messages.");
      setTickets(Array.isArray(json?.tickets) ? json.tickets : []);
    } catch (error) {
      notify.error(error instanceof Error ? error.message : "Could not load messages.");
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  React.useEffect(() => {
    void load();
  }, [load]);

  async function sendMessage() {
    const body = message.trim();
    if (!body) {
      notify.error("Write a message before sending.");
      return;
    }
    const sb = getSupabaseBrowser();
    if (!sb) return;
    setSending(true);
    try {
      const { data } = await sb.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error("Sign in required.");
      const res = await fetch("/api/business-support", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ticketId: activeTicket?.status === "closed" ? undefined : activeTicket?.id,
          message: body,
        }),
      });
      const json = (await res.json().catch(() => null)) as { tickets?: BusinessTicket[]; error?: string } | null;
      if (!res.ok) throw new Error(json?.error || "Could not send message.");
      setTickets(Array.isArray(json?.tickets) ? json.tickets : []);
      setMessage("");
      notify.success("Message sent");
    } catch (error) {
      notify.error(error instanceof Error ? error.message : "Could not send message.");
    } finally {
      setSending(false);
    }
  }

  if (!enabled) return null;

  return (
    <section className="rounded-3xl border border-border/55 bg-background/45 p-4 sm:p-5">
      <div className="flex flex-col gap-3 border-b border-border/55 pb-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <MessageSquareReply className="size-4 text-primary" aria-hidden />
            <h4 className="text-base font-semibold text-foreground">Business support ticket</h4>
          </div>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            Send us your business request and keep replies here as one conversation.
          </p>
        </div>
        {activeTicket ? (
          <Badge variant="outline" className="w-fit border-border/65 bg-muted/35 px-2.5 py-1 text-xs">
            {statusLabel(activeTicket.status)}
          </Badge>
        ) : null}
      </div>

      <div className="mt-4 max-h-80 space-y-3 overflow-y-auto pr-1">
        {loading ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            Loading conversation
          </p>
        ) : activeTicket?.messages.length ? (
          activeTicket.messages.map((item) => (
            <div
              key={item.id}
              className={cn(
                "max-w-[88%] rounded-2xl border px-3 py-2 text-sm",
                item.senderType === "user"
                  ? "ml-auto border-primary/20 bg-primary/10 text-foreground"
                  : "border-border/60 bg-card text-foreground"
              )}
            >
              <div className="mb-1 flex flex-wrap items-center justify-between gap-2 text-[11px] font-semibold text-muted-foreground">
                <span>{item.senderType === "user" ? "You" : "Tulmin admin"}</span>
                <span>{formatDate(item.createdAt)}</span>
              </div>
              <p className="whitespace-pre-wrap leading-relaxed">{item.body}</p>
            </div>
          ))
        ) : (
          <p className="rounded-2xl border border-border/55 bg-card/70 p-4 text-sm text-muted-foreground">
            No ticket yet. Write your request below and we will reply here.
          </p>
        )}
      </div>

      <div className="mt-4 grid gap-3">
        <textarea
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          placeholder="Write your message to Tulmin..."
          className="min-h-28 resize-y rounded-2xl border border-border/65 bg-background px-3 py-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-primary/60"
          maxLength={5000}
        />
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-muted-foreground">{message.length.toLocaleString("en-IN")} / 5,000</p>
          <Button type="button" className="sm:min-w-36" disabled={sending} onClick={() => void sendMessage()}>
            {sending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Send className="size-4" aria-hidden />}
            Send message
          </Button>
        </div>
      </div>
    </section>
  );
}
