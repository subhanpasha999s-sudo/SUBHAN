"use client";
/** Team & roles (owner-only) — invite, role matrix, audit log. */
import { useState } from "react";
import { UserPlus } from "lucide-react";
import { useV2 } from "@/book/lib/v2/store";
import { Guard, PageHeader, fmtDate } from "@/book/components/v2/common";
import { Badge, Button, Card } from "@/book/components/ui";
import { ROLE_LABELS } from "@/book/lib/v2/rbac";
import { Role } from "@/book/lib/v2/types";

const ROLE_DESC: Record<Role, string> = {
  owner: "Everything, incl. team & financials",
  manager: "Everything except team management",
  returns_manager: "Returns & QC only — no financial data",
  accountant: "P&L, expenses, GST, settlements",
  viewer: "Read-only dashboards",
};

export default function TeamPage() {
  const { state, actions } = useV2();
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [role, setRole] = useState<Role>("returns_manager");

  function invite() {
    if (!name.trim()) return;
    const isEmail = contact.includes("@");
    actions.inviteUser({
      name: name.trim(),
      role,
      email: isEmail ? contact.trim() : undefined,
      phone: isEmail ? undefined : contact.trim(),
    });
    setName(""); setContact("");
  }

  const input = "rounded-xl border border-border bg-card px-3 py-2 text-sm";

  return (
    <Guard section="team">
      <PageHeader title="Team & roles" sub={state.org.name} />

      <Card className="mb-6 p-5">
        <h3 className="mb-3 flex items-center gap-2 font-semibold"><UserPlus className="h-4 w-4" /> Invite a teammate</h3>
        <div className="grid gap-2 md:grid-cols-4">
          <input className={input} placeholder="Name *" value={name} onChange={(e) => setName(e.target.value)} />
          <input className={input} placeholder="Phone or email" value={contact} onChange={(e) => setContact(e.target.value)} />
          <select className={input} value={role} onChange={(e) => setRole(e.target.value as Role)}>
            {(["manager", "returns_manager", "accountant", "viewer"] as Role[]).map((r) => (
              <option key={r} value={r}>{ROLE_LABELS[r]}</option>
            ))}
          </select>
          <Button onClick={invite}>Send invite</Button>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          {ROLE_DESC[role]}. They&apos;ll land directly in their permitted area
          {role === "returns_manager" ? " (Returns & QC)" : ""} after signing in.
        </p>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="overflow-hidden">
          <div className="border-b border-border px-4 py-3 font-semibold">Members</div>
          <div className="divide-y divide-border text-sm">
            {state.users.map((u) => (
              <div key={u.id} className="flex items-center gap-2 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate font-medium">{u.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{u.phone || u.email || "—"}</p>
                </div>
                <Badge tone={u.role === "owner" ? "info" : "default"} className="ml-auto">{ROLE_LABELS[u.role]}</Badge>
              </div>
            ))}
          </div>
        </Card>

        <Card className="overflow-hidden">
          <div className="border-b border-border px-4 py-3 font-semibold">Audit log</div>
          <div className="max-h-96 divide-y divide-border overflow-y-auto text-sm">
            {[...state.audit].reverse().map((a, i) => (
              <div key={i} className="px-4 py-2.5">
                <div className="flex items-center gap-2">
                  <Badge>{a.action}</Badge>
                  <span className="truncate text-xs">{a.entity}</span>
                  <span className="ml-auto shrink-0 text-xs text-muted-foreground">{fmtDate(a.at)}</span>
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {a.actor}{a.details ? ` · ${a.details}` : ""}
                </p>
              </div>
            ))}
            {state.audit.length === 0 && <p className="px-4 py-6 text-center text-xs text-muted-foreground">No activity yet.</p>}
          </div>
        </Card>
      </div>
    </Guard>
  );
}
