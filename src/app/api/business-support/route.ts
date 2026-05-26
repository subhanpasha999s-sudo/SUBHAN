import { NextResponse, type NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  getServerEntitlement,
  requestFingerprint,
  requireBillingUser,
} from "@/lib/billing/server";
import {
  cleanTicketMessage,
  mapBusinessTicket,
  type BusinessTicketStatus,
} from "@/lib/business-support/tickets";
import { getSupabaseServiceRole } from "@/lib/supabase/server-admin";

type TicketRow = Parameters<typeof mapBusinessTicket>[0];
type MessageRow = NonNullable<Parameters<typeof mapBusinessTicket>[1]>[number];

async function requireBusinessAccount(req: NextRequest) {
  const auth = await requireBillingUser(req);
  if (!auth.ok) return auth;

  const service = getSupabaseServiceRole();
  if (!service) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Business support backend is not configured." }, { status: 503 }),
    };
  }
  const browser = Object.fromEntries(req.nextUrl.searchParams.entries());
  const entitlement = await getServerEntitlement(service, auth.user.id, requestFingerprint(req, browser).deviceHash);
  if (entitlement.plan !== "business") {
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: "Business support is available on the Business plan." },
        { status: 403 }
      ),
    };
  }

  return { ok: true as const, service, user: auth.user, entitlement };
}

async function loadTickets(service: SupabaseClient, userId: string) {
  const tickets = await service
    .from("tulmin_business_tickets")
    .select("*")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(10);

  if (tickets.error) throw new Error(tickets.error.message);
  const rows = (tickets.data ?? []) as TicketRow[];
  const ids = rows.map((row) => row.id);
  const messages = ids.length
    ? await service
        .from("tulmin_business_ticket_messages")
        .select("*")
        .in("ticket_id", ids)
        .order("created_at", { ascending: true })
    : { data: [], error: null };
  if (messages.error) throw new Error(messages.error.message);

  const byTicketId = new Map<number, MessageRow[]>();
  for (const message of (messages.data ?? []) as MessageRow[]) {
    const existing = byTicketId.get(message.ticket_id) ?? [];
    existing.push(message);
    byTicketId.set(message.ticket_id, existing);
  }

  return rows.map((row) => mapBusinessTicket(row, byTicketId.get(row.id) ?? []));
}

export async function GET(req: NextRequest) {
  const auth = await requireBusinessAccount(req);
  if (!auth.ok) return auth.response;

  try {
    return NextResponse.json({ tickets: await loadTickets(auth.service, auth.user.id) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not load business messages." },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireBusinessAccount(req);
  if (!auth.ok) return auth.response;

  const body = (await req.json().catch(() => ({}))) as { message?: unknown; ticketId?: unknown };
  const message = cleanTicketMessage(body.message);
  if (!message) return NextResponse.json({ error: "Write a message before sending." }, { status: 400 });

  try {
    const requestedTicketId = Math.max(0, Math.floor(Number(body.ticketId) || 0));
    let ticketId = requestedTicketId;
    const metadata = auth.user.user_metadata ?? {};
    const userName = typeof metadata.full_name === "string" ? metadata.full_name : "";
    const company = typeof metadata.company === "string" ? metadata.company : "";
    const now = new Date().toISOString();

    if (ticketId) {
      const existing = await auth.service
        .from("tulmin_business_tickets")
        .select("id,status")
        .eq("id", ticketId)
        .eq("user_id", auth.user.id)
        .maybeSingle();
      if (existing.error) throw new Error(existing.error.message);
      if (!existing.data) return NextResponse.json({ error: "Ticket not found." }, { status: 404 });
      if ((existing.data.status as BusinessTicketStatus) === "closed") {
        return NextResponse.json({ error: "This ticket is closed. Start a new conversation." }, { status: 400 });
      }
    } else {
      const openTicket = await auth.service
        .from("tulmin_business_tickets")
        .select("id")
        .eq("user_id", auth.user.id)
        .neq("status", "closed")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (openTicket.error) throw new Error(openTicket.error.message);
      ticketId = Number(openTicket.data?.id) || 0;
    }

    if (!ticketId) {
      const created = await auth.service
        .from("tulmin_business_tickets")
        .insert({
          user_id: auth.user.id,
          user_email: auth.user.email ?? auth.user.id,
          user_name: userName,
          company,
          plan: auth.entitlement.plan,
          subject: "Business account request",
          status: "open",
          last_user_message_at: now,
          updated_at: now,
        })
        .select("id")
        .single();
      if (created.error) throw new Error(created.error.message);
      ticketId = Number(created.data.id);
    }

    const saved = await auth.service.from("tulmin_business_ticket_messages").insert({
      ticket_id: ticketId,
      sender_type: "user",
      sender_id: auth.user.id,
      sender_email: auth.user.email ?? auth.user.id,
      body: message,
    });
    if (saved.error) throw new Error(saved.error.message);

    const updated = await auth.service
      .from("tulmin_business_tickets")
      .update({
        user_email: auth.user.email ?? auth.user.id,
        user_name: userName,
        company,
        plan: auth.entitlement.plan,
        status: "user_replied",
        last_user_message_at: now,
        updated_at: now,
      })
      .eq("id", ticketId);
    if (updated.error) throw new Error(updated.error.message);

    return NextResponse.json({ ok: true, tickets: await loadTickets(auth.service, auth.user.id) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not send business message." },
      { status: 500 }
    );
  }
}
