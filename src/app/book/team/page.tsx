"use client";
/** Team & roles (owner-only) — org profile, backup, API keys, invite, roles, audit. */
import { useEffect, useRef, useState } from "react";
import { UserPlus, Building2, Download, Upload, KeyRound, Copy, Trash2 } from "lucide-react";
import { useV2 } from "@/book/lib/v2/store";
import { Guard, PageHeader, fmtDate } from "@/book/components/v2/common";
import { Badge, Button, Card } from "@/book/components/ui";
import { ROLE_LABELS } from "@/book/lib/v2/rbac";
import { Role } from "@/book/lib/v2/types";
import { flags } from "@/book/lib/flags";
import { serializeBackup, parseBackup, backupRecordCount } from "@/book/lib/core/backup";
import { GST_STATE_CODES } from "@/book/lib/core/gstPack";
import { CUSTOM_FIELD_ENTITIES, type CustomFieldType, type CustomFieldEntity } from "@/book/lib/core/customFields";
import { isApiAuthed, listApiKeys, createApiKey, revokeApiKey, type ApiKeyRow } from "@/book/lib/core/apiKeysRemote";
import {
  isBookAuthed, listOrgStaff, createStaffInvite, revokeStaffInvite,
  type OrgMemberRow, type OrgInviteRow,
} from "@/book/lib/bookStateRemote";

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
      <PageHeader title="Team & settings" sub={state.org.name} />

      {flags.orgSettings && <OrgSettingsCard />}
      {flags.staffLogin && <StaffAccessCard />}
      {flags.publicApi && <ApiKeysCard />}
      {flags.customFields && <CustomFieldsCard />}

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

/**
 * Staff access — REAL logins for teammates. Generate a role-scoped invite
 * code; the staff member signs in with their own account at /book/join and
 * redeems it. Their permissions are enforced from the org membership.
 */
function StaffAccessCard() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [members, setMembers] = useState<OrgMemberRow[]>([]);
  const [invites, setInvites] = useState<OrgInviteRow[]>([]);
  const [role, setRole] = useState<Exclude<Role, "owner">>("accountant");
  const [freshCode, setFreshCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const input = "rounded-xl border border-border bg-card px-3 py-2 text-sm";

  async function refresh() {
    const r = await listOrgStaff();
    if (r) { setMembers(r.members); setInvites(r.invites); }
  }
  useEffect(() => { (async () => {
    const ok = await isBookAuthed();
    setAuthed(ok);
    if (ok) await refresh();
  })(); }, []);

  async function generate() {
    setBusy(true); setFreshCode(null);
    const res = await createStaffInvite(role);
    setBusy(false);
    if (!res.ok || !res.code) { window.alert(res.message ?? "Could not create invite."); return; }
    setFreshCode(res.code);
    await refresh();
  }

  const joinUrl = (code: string) =>
    `${typeof window !== "undefined" ? window.location.origin : ""}/book/join?code=${code}`;

  return (
    <Card className="mb-6 p-5">
      <h3 className="mb-1 flex items-center gap-2 font-semibold"><UserPlus className="h-4 w-4" /> Staff access (real logins)</h3>
      <p className="mb-3 text-xs text-muted-foreground">
        Each teammate signs in with their <span className="font-medium">own</span> account and joins with an invite code — their role is enforced on every screen and action.
      </p>
      {authed === false ? (
        <p className="text-sm text-muted-foreground">Sign in to invite staff to your workspace.</p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <select className={input} value={role} onChange={(e) => setRole(e.target.value as Exclude<Role, "owner">)}>
              {(["manager", "accountant", "returns_manager", "viewer"] as const).map((r) => (
                <option key={r} value={r}>{ROLE_LABELS[r]}</option>
              ))}
            </select>
            <Button onClick={generate} disabled={busy}>Generate invite code</Button>
          </div>
          {freshCode && (
            <div className="mt-3 rounded-lg border border-success/40 bg-emerald-50 p-3 text-sm dark:bg-emerald-950">
              <p className="mb-1 text-xs font-medium">Share this with your teammate (valid 14 days, single use):</p>
              <div className="flex flex-wrap items-center gap-2">
                <code className="rounded bg-card px-2 py-1 text-xs">{freshCode}</code>
                <button onClick={() => navigator.clipboard?.writeText(freshCode)} className="rounded-md border border-border px-2 py-1 text-xs hover:bg-muted">Copy code</button>
                <button onClick={() => navigator.clipboard?.writeText(joinUrl(freshCode))} className="rounded-md border border-border px-2 py-1 text-xs hover:bg-muted">Copy join link</button>
              </div>
            </div>
          )}

          {members.length > 0 && (
            <div className="mt-4">
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Members</p>
              <div className="divide-y divide-border text-sm">
                {members.map((m) => (
                  <div key={m.userId} className="flex items-center gap-2 py-1.5">
                    <span className="truncate">{m.isMe ? "You" : m.email ?? m.userId.slice(0, 8)}</span>
                    <Badge tone={m.role === "owner" ? "success" : "default"}>{ROLE_LABELS[m.role]}</Badge>
                  </div>
                ))}
              </div>
            </div>
          )}

          {invites.filter((i) => !i.usedAt).length > 0 && (
            <div className="mt-4">
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Pending invites</p>
              <div className="divide-y divide-border text-sm">
                {invites.filter((i) => !i.usedAt).map((i) => (
                  <div key={i.id} className="flex items-center gap-2 py-1.5">
                    <code className="text-xs">{i.code}</code>
                    <Badge tone="default">{ROLE_LABELS[i.role]}</Badge>
                    <span className="text-xs text-muted-foreground">expires {fmtDate(i.expiresAt)}</span>
                    <button onClick={async () => { await revokeStaffInvite(i.id); await refresh(); }}
                      className="ml-auto text-xs text-muted-foreground hover:text-danger">Revoke</button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </Card>
  );
}

/** API-key management for the public REST API (Phase 10). Requires sign-in. */
function ApiKeysCard() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [keys, setKeys] = useState<ApiKeyRow[]>([]);
  const [name, setName] = useState("");
  const [scopes, setScopes] = useState<("read" | "write")[]>(["read"]);
  const [freshKey, setFreshKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { (async () => {
    const ok = await isApiAuthed();
    setAuthed(ok);
    if (ok) setKeys(await listApiKeys());
  })(); }, []);

  async function generate() {
    setBusy(true); setFreshKey(null);
    const res = await createApiKey(name, scopes);
    if (res.ok && res.plaintext) { setFreshKey(res.plaintext); setName(""); setKeys(await listApiKeys()); }
    else if (res.message) window.alert(res.message);
    setBusy(false);
  }

  return (
    <Card className="mb-6 p-5">
      <h3 className="mb-3 flex items-center gap-2 font-semibold"><KeyRound className="h-4 w-4" /> API keys</h3>
      {authed === false ? (
        <p className="text-sm text-muted-foreground">Sign in to your Tulmin account to create API keys for the REST API (<code className="rounded bg-muted px-1">/api/v1</code>).</p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <input className="rounded-xl border border-border bg-card px-3 py-2 text-sm" placeholder="Key name (e.g. Zapier)" value={name} onChange={(e) => setName(e.target.value)} />
            <label className="flex items-center gap-1 text-xs"><input type="checkbox" className="h-4 w-4 accent-[var(--primary)]" checked={scopes.includes("write")} onChange={(e) => setScopes(e.target.checked ? ["read", "write"] : ["read"])} /> allow write</label>
            <Button onClick={generate} disabled={busy}>Generate key</Button>
          </div>
          {freshKey && (
            <div className="mt-3 rounded-lg border border-warning/40 bg-amber-50 p-3 text-sm dark:bg-amber-950">
              <p className="mb-1 text-xs font-medium text-amber-900 dark:text-amber-200">Copy this key now — it won&apos;t be shown again.</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 break-all rounded bg-card px-2 py-1 text-xs">{freshKey}</code>
                <button onClick={() => navigator.clipboard?.writeText(freshKey)} className="rounded-md border border-border p-1 hover:bg-muted"><Copy className="h-3.5 w-3.5" /></button>
              </div>
            </div>
          )}
          <div className="mt-3 divide-y divide-border text-sm">
            {keys.map((k) => (
              <div key={k.id} className="flex flex-wrap items-center gap-2 py-2">
                <span className="font-medium">{k.name}</span>
                <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{k.prefix}…</code>
                {k.scopes.map((s) => <Badge key={s} tone="default">{s}</Badge>)}
                {k.revokedAt ? <Badge tone="danger">revoked</Badge>
                  : <span className="ml-auto text-xs text-muted-foreground">{k.lastUsedAt ? `used ${fmtDate(k.lastUsedAt)}` : "never used"}</span>}
                {!k.revokedAt && (
                  <button onClick={async () => { if (window.confirm(`Revoke "${k.name}"? Apps using it will stop working.`)) { await revokeApiKey(k.id); setKeys(await listApiKeys()); } }}
                    className="text-muted-foreground hover:text-danger"><Trash2 className="h-4 w-4" /></button>
                )}
              </div>
            ))}
            {keys.length === 0 && <p className="py-3 text-xs text-muted-foreground">No API keys yet.</p>}
          </div>
        </>
      )}
    </Card>
  );
}

/** Custom-field definitions manager (Phase 10). */
function CustomFieldsCard() {
  const { state, actions } = useV2();
  const [label, setLabel] = useState("");
  const [entity, setEntity] = useState<CustomFieldEntity>("customer");
  const [type, setType] = useState<CustomFieldType>("text");
  const [options, setOptions] = useState("");
  const input = "rounded-xl border border-border bg-card px-3 py-2 text-sm";
  const defs = state.customFieldDefs ?? [];

  function add() {
    if (!label.trim()) return;
    actions.addCustomFieldDef({
      entity, label: label.trim(), type,
      options: type === "select" ? options.split(",").map((o) => o.trim()).filter(Boolean) : undefined,
    });
    setLabel(""); setOptions("");
  }

  return (
    <Card className="mb-6 p-5">
      <h3 className="mb-3 font-semibold">Custom fields</h3>
      <div className="grid gap-2 md:grid-cols-[1fr_auto_auto_auto]">
        <input className={input} placeholder="Field label (e.g. Loyalty tier)" value={label} onChange={(e) => setLabel(e.target.value)} />
        <select className={input} value={entity} onChange={(e) => setEntity(e.target.value as CustomFieldEntity)}>
          {CUSTOM_FIELD_ENTITIES.map((e) => <option key={e.id} value={e.id}>{e.label}</option>)}
        </select>
        <select className={input} value={type} onChange={(e) => setType(e.target.value as CustomFieldType)}>
          {(["text", "number", "date", "select", "checkbox"] as CustomFieldType[]).map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <Button onClick={add} disabled={!label.trim() || (type === "select" && !options.trim())}>Add field</Button>
      </div>
      {type === "select" && (
        <input className={`${input} mt-2 w-full`} placeholder="Options, comma-separated (e.g. Gold, Silver, Bronze)" value={options} onChange={(e) => setOptions(e.target.value)} />
      )}
      {defs.length > 0 && (
        <div className="mt-3 divide-y divide-border text-sm">
          {defs.map((d) => (
            <div key={d.id} className="flex items-center gap-2 py-1.5">
              <span className="font-medium">{d.label}</span>
              <Badge tone="default">{CUSTOM_FIELD_ENTITIES.find((e) => e.id === d.entity)?.label}</Badge>
              <span className="text-xs text-muted-foreground">{d.type}{d.options ? ` · ${d.options.join("/")}` : ""}</span>
              <button onClick={() => actions.deleteCustomFieldDef(d.id)} className="ml-auto text-xs text-muted-foreground hover:text-danger">Remove</button>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

/** Org profile (drives GST place-of-supply + document branding) + full backup. */
function OrgSettingsCard() {
  const { state, actions } = useV2();
  const [name, setName] = useState(state.org.name);
  const [gstin, setGstin] = useState(state.org.gstin ?? "");
  const [orgState, setOrgState] = useState(state.org.state ?? "");
  const fileRef = useRef<HTMLInputElement>(null);
  const input = "rounded-xl border border-border bg-card px-3 py-2 text-sm";
  const dirty = name !== state.org.name || gstin !== (state.org.gstin ?? "") || orgState !== (state.org.state ?? "");
  const stateNames = Object.keys(GST_STATE_CODES).map((s) => s.replace(/\b\w/g, (c) => c.toUpperCase()));

  function exportBackup() {
    const blob = new Blob([serializeBackup(state)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `tulmin-book-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function importBackup(file: File) {
    const parsed = parseBackup(await file.text());
    if (!parsed.ok || !parsed.state) { window.alert(parsed.message ?? "Invalid backup."); return; }
    const incoming = backupRecordCount(parsed.state);
    const current = backupRecordCount(state);
    if (!window.confirm(`Replace ALL current data (${current} records) with this backup (${incoming} records)? This cannot be undone.`)) return;
    actions.restoreBackup(parsed.state);
    window.alert("Backup restored.");
  }

  return (
    <Card className="mb-6 p-5">
      <h3 className="mb-3 flex items-center gap-2 font-semibold"><Building2 className="h-4 w-4" /> Organization</h3>
      <div className="grid gap-2 md:grid-cols-3">
        <label className="space-y-1 text-xs"><span className="text-muted-foreground">Business name</span>
          <input className={`${input} w-full`} value={name} onChange={(e) => setName(e.target.value)} /></label>
        <label className="space-y-1 text-xs"><span className="text-muted-foreground">GSTIN</span>
          <input className={`${input} w-full`} value={gstin} onChange={(e) => setGstin(e.target.value)} placeholder="29ABCDE1234F1Z5" /></label>
        <label className="space-y-1 text-xs"><span className="text-muted-foreground">State (GST place of supply)</span>
          <input className={`${input} w-full`} list="gst-states" value={orgState} onChange={(e) => setOrgState(e.target.value)} placeholder="Karnataka" />
          <datalist id="gst-states">{stateNames.map((s) => <option key={s} value={s} />)}</datalist>
        </label>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">Your state decides CGST/SGST (intra-state) vs IGST (inter-state) on the GST reports.</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button onClick={() => actions.updateOrg({ name: name.trim(), gstin: gstin.trim(), state: orgState.trim() })} disabled={!dirty}>Save profile</Button>
        <span className="mx-2 h-5 w-px bg-border" />
        <Button variant="secondary" onClick={exportBackup}><Download className="h-4 w-4" /> Export backup</Button>
        <Button variant="secondary" onClick={() => fileRef.current?.click()}><Upload className="h-4 w-4" /> Restore backup</Button>
        <input ref={fileRef} type="file" accept=".json,application/json" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) importBackup(f); e.target.value = ""; }} />
      </div>
    </Card>
  );
}
