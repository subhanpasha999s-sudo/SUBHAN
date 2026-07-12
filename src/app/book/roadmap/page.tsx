"use client";
/**
 * What's next — a calm, single page showing what recently shipped and what's
 * coming, so the product roadmap lives here instead of cluttering the app.
 */
import { CheckCircle2, Rocket, Hourglass } from "lucide-react";
import { Guard, PageHeader } from "@/book/components/v2/common";
import { Badge, Card } from "@/book/components/ui";

const SHIPPED: { title: string; detail: string }[] = [
  { title: "Full double-entry accounting core", detail: "Immutable ledger, chart of accounts, manual journals, trial balance — every rupee posts balanced." },
  { title: "Sales & purchases suite", detail: "Invoices, receipts, credit notes, estimates, recurring invoices, bills, purchase orders, vendor payments." },
  { title: "Bank matching & payout tie-out", detail: "Match bank lines to invoices/bills and Meesho payout batches to deposits — no double-counting." },
  { title: "India GST pack", detail: "GSTR-1 B2C by place of supply, HSN summary, GSTR-3B working numbers, TCS/TDS credit ledgers." },
  { title: "Settlement health", detail: "Exceptions queue (missing/short/negative settlements) with a resolution workflow + deduction breakdown." },
  { title: "Staff logins with OTP", detail: "Role-scoped invite codes, separate accounts, email-OTP verification enforced at login and join." },
  { title: "Public REST API", detail: "API keys with scopes; read accounts/journals/trial balance, post balanced entries." },
];

const NEXT: { title: string; detail: string; eta: string }[] = [
  { title: "Flipkart marketplace pack", detail: "Order + settlement imports through the same reconciliation pipeline as Meesho.", eta: "next" },
  { title: "Amazon marketplace pack", detail: "Seller Central settlement reports as pack #3.", eta: "next" },
  { title: "Member role editor", detail: "Change a staff member's role or remove them without re-inviting.", eta: "soon" },
  { title: "E-invoicing (IRN/QR)", detail: "Provider interface for B2B e-invoices under the GST pack.", eta: "soon" },
  { title: "Recurring bills & vendor advances", detail: "Complete the payables automation set.", eta: "soon" },
  { title: "Warehouses & multi-location stock", detail: "Per-location quantities and transfers.", eta: "exploring" },
  { title: "Webhooks", detail: "Signed, retried event delivery for the public API.", eta: "exploring" },
];

const ETA_TONE: Record<string, "success" | "warning" | "default"> = { next: "success", soon: "warning", exploring: "default" };

export default function RoadmapPage() {
  return (
    <Guard section="roadmap">
      <PageHeader title="What's next" sub="Recently shipped and what's coming — the roadmap in one calm page" />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="overflow-hidden">
          <div className="flex items-center gap-2 border-b border-border px-4 py-3 font-semibold">
            <CheckCircle2 className="h-4 w-4 text-success" /> Recently shipped
          </div>
          <div className="divide-y divide-border">
            {SHIPPED.map((s) => (
              <div key={s.title} className="px-4 py-3">
                <p className="text-sm font-medium">{s.title}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{s.detail}</p>
              </div>
            ))}
          </div>
        </Card>

        <Card className="overflow-hidden">
          <div className="flex items-center gap-2 border-b border-border px-4 py-3 font-semibold">
            <Rocket className="h-4 w-4 text-primary" /> Coming next
          </div>
          <div className="divide-y divide-border">
            {NEXT.map((n) => (
              <div key={n.title} className="px-4 py-3">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium">{n.title}</p>
                  <Badge tone={ETA_TONE[n.eta]}>{n.eta}</Badge>
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">{n.detail}</p>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <p className="mt-4 flex items-center gap-1.5 text-xs text-muted-foreground">
        <Hourglass className="h-3.5 w-3.5" /> Priorities shift with your feedback — tell us what you need next.
      </p>
    </Guard>
  );
}
