export type BusinessTicketStatus = "open" | "user_replied" | "admin_replied" | "closed";

export type BusinessTicketMessage = {
  id: number;
  ticketId: number;
  senderType: "user" | "admin";
  senderEmail: string;
  body: string;
  createdAt: string;
};

export type BusinessTicket = {
  id: number;
  userId: string;
  userEmail: string;
  userName: string;
  company: string;
  plan: string;
  subject: string;
  status: BusinessTicketStatus;
  createdAt: string;
  updatedAt: string;
  lastUserMessageAt: string | null;
  lastAdminMessageAt: string | null;
  messages: BusinessTicketMessage[];
};

type TicketRow = {
  id: number;
  user_id: string;
  user_email: string;
  user_name: string | null;
  company: string | null;
  plan: string;
  subject: string;
  status: BusinessTicketStatus;
  created_at: string;
  updated_at: string;
  last_user_message_at: string | null;
  last_admin_message_at: string | null;
};

type MessageRow = {
  id: number;
  ticket_id: number;
  sender_type: "user" | "admin";
  sender_email: string;
  body: string;
  created_at: string;
};

export function cleanTicketMessage(value: unknown) {
  return typeof value === "string" ? value.trim().slice(0, 5000) : "";
}

export function mapBusinessTicket(row: TicketRow, messages: MessageRow[] = []): BusinessTicket {
  return {
    id: row.id,
    userId: row.user_id,
    userEmail: row.user_email,
    userName: row.user_name ?? "",
    company: row.company ?? "",
    plan: row.plan,
    subject: row.subject,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastUserMessageAt: row.last_user_message_at,
    lastAdminMessageAt: row.last_admin_message_at,
    messages: messages.map((message) => ({
      id: message.id,
      ticketId: message.ticket_id,
      senderType: message.sender_type,
      senderEmail: message.sender_email,
      body: message.body,
      createdAt: message.created_at,
    })),
  };
}
