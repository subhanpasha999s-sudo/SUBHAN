import { NextResponse, type NextRequest } from "next/server";

import { requireAdmin } from "@/lib/admin/auth";
import {
  cleanTicketMessage,
  mapBusinessTicket,
  type BusinessTicketStatus,
} from "@/lib/business-support/tickets";
import { getSupabaseServiceRole } from "@/lib/supabase/server-admin";

type TicketRow = Parameters<typeof mapBusinessTicket>[0];
type MessageRow = NonNullable<Parameters<typeof mapBusinessTicket>[1]>[number];

async function loadTickets(service: NonNullable<ReturnType<typeof getSupabaseServiceRole>>) {
  const tickets = await service
    .from("tulmin_business_tickets")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(100);
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
  const admin = await requireAdmin(req);
  if (admin instanceof NextResponse) return admin;

  const service = getSupabaseServiceRole();
  if (!service) return NextResponse.json({ error: "Service role is not configured." }, { status: 503 });

  try {
    return NextResponse.json({ admin, tickets: await loadTickets(service) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not load business tickets." },
      { status: 500 }
    );
  }
}

export async function PUT(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (admin instanceof NextResponse) return admin;

  const service = getSupabaseServiceRole();
  if (!service) return NextResponse.json({ error: "Service role is not configured." }, { status: 503 });

  const body = (await req.json().catch(() => ({}))) as {
    ticketId?: unknown;
    message?: unknown;
    status?: BusinessTicketStatus;
  };
  const ticketId = Math.max(0, Math.floor(Number(body.ticketId) || 0));
  if (!ticketId) return NextResponse.json({ error: "Ticket is required." }, { status: 400 });

  const status = body.status === "closed" || body.status === "open" ? body.status : undefined;
  const message = cleanTicketMessage(body.message);
  if (!message && !status) {
    return NextResponse.json({ error: "Reply or status update is required." }, { status: 400 });
  }

  try {
    const ticket = await service
      .from("tulmin_business_tickets")
      .select("id")
      .eq("id", ticketId)
      .maybeSingle();
    if (ticket.error) throw new Error(ticket.error.message);
    if (!ticket.data) return NextResponse.json({ error: "Ticket not found." }, { status: 404 });

    const now = new Date().toISOString();
    if (message) {
      const saved = await service.from("tulmin_business_ticket_messages").insert({
        ticket_id: ticketId,
        sender_type: "admin",
        sender_id: admin.id,
        sender_email: admin.email,
        body: message,
      });
      if (saved.error) throw new Error(saved.error.message);
    }

    const patch: Record<string, unknown> = {
      status: status ?? (message ? "admin_replied" : "open"),
      updated_at: now,
    };
    if (message) patch.last_admin_message_at = now;

    const updated = await service
      .from("tulmin_business_tickets")
      .update(patch)
      .eq("id", ticketId);
    if (updated.error) throw new Error(updated.error.message);

    return NextResponse.json({ ok: true, tickets: await loadTickets(service) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not update business ticket." },
      { status: 500 }
    );
  }
}
