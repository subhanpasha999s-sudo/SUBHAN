"use client";
/**
 * Bank / card account management (§2.1). CRUD with soft-delete (archive) so
 * historical transactions survive (§6).
 */
import { useState } from "react";
import { Building2, CreditCard, Wallet, Pencil, Archive, Plus, X } from "lucide-react";
import { useV2 } from "@/book/lib/v2/store";
import type { BankAccount, BankAccountType } from "@/book/lib/v2/types";
import { motion, AnimatePresence, fadeUp, stagger, SPRING_SOFT } from "@/book/components/v2/motion";

const TYPE_META: Record<BankAccountType, { label: string; icon: typeof Building2 }> = {
  bank:        { label: "Bank account", icon: Building2 },
  credit_card: { label: "Credit card",  icon: CreditCard },
  cash:        { label: "Cash",         icon: Wallet },
};

const inr = (n: number) =>
  "₹" + new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(n);

type Draft = Omit<BankAccount, "id" | "createdAt">;
const emptyDraft: Draft = {
  name: "", bankName: "", accountNumberLast4: "", currency: "INR",
  accountType: "bank", openingBalance: 0,
};

function AccountForm({
  initial, onSave, onClose,
}: { initial?: BankAccount; onSave: (d: Draft) => void; onClose: () => void }) {
  const [d, setD] = useState<Draft>(initial ? { ...initial } : emptyDraft);
  const valid = d.name.trim() && d.bankName.trim();
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD(p => ({ ...p, [k]: v }));

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.92, y: 24 }} animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.92, y: 24 }} transition={SPRING_SOFT}
        className="w-full max-w-md rounded-2xl bg-[var(--card)] p-6 shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-bold">{initial ? "Edit account" : "Add bank account"}</h3>
          <button onClick={onClose} className="text-[var(--muted-foreground)] hover:text-[var(--foreground)]"><X className="h-5 w-5" /></button>
        </div>

        <div className="space-y-3">
          <Field label="Account name">
            <input value={d.name} onChange={e => set("name", e.target.value)} placeholder="e.g. HDFC Current"
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm" />
          </Field>
          <Field label="Bank name">
            <input value={d.bankName} onChange={e => set("bankName", e.target.value)} placeholder="e.g. HDFC Bank"
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Account no. (last 4)">
              <input value={d.accountNumberLast4} maxLength={4} inputMode="numeric"
                onChange={e => set("accountNumberLast4", e.target.value.replace(/\D/g, "").slice(0, 4))}
                placeholder="4821"
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm" />
            </Field>
            <Field label="Currency">
              <input value={d.currency} onChange={e => set("currency", e.target.value.toUpperCase().slice(0, 3))}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm" />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Account type">
              <select value={d.accountType} onChange={e => set("accountType", e.target.value as BankAccountType)}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm">
                <option value="bank">Bank account</option>
                <option value="credit_card">Credit card</option>
                <option value="cash">Cash</option>
              </select>
            </Field>
            <Field label="Opening balance">
              <input type="number" value={d.openingBalance}
                onChange={e => set("openingBalance", parseFloat(e.target.value) || 0)}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm" />
            </Field>
          </div>
        </div>

        <div className="mt-5 flex gap-3">
          <button onClick={onClose} className="flex-1 rounded-xl border border-[var(--border)] py-2 text-sm hover:bg-[var(--muted)]">Cancel</button>
          <motion.button
            disabled={!valid} whileHover={valid ? { scale: 1.03 } : undefined} whileTap={valid ? { scale: 0.97 } : undefined}
            onClick={() => onSave(d)}
            className="flex-1 rounded-xl bg-gradient-to-r from-[var(--primary)] to-[#a855f7] py-2 text-sm font-medium text-white shadow-lg shadow-[var(--primary)]/25 disabled:opacity-40 disabled:shadow-none"
          >
            {initial ? "Save changes" : "Add account"}
          </motion.button>
        </div>
      </motion.div>
    </motion.div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-[var(--muted-foreground)]">{label}</span>
      {children}
    </label>
  );
}

export function BankAccounts() {
  const { state, actions } = useV2();
  const accounts = (state?.bankAccounts ?? []).filter(a => !a.archived);
  const [editing, setEditing] = useState<BankAccount | null>(null);
  const [adding, setAdding] = useState(false);

  // count of uncategorized txns per account (attention indicator, §2.8)
  const uncategorizedByAccount = (id: string) =>
    (state?.bankTxns ?? []).filter(t => t.bankAccountId === id && t.status === "PENDING").length;

  return (
    <motion.div variants={stagger} initial="hidden" animate="show" className="space-y-5">
      <motion.div variants={fadeUp} className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">Bank & card accounts</h2>
          <p className="text-sm text-[var(--muted-foreground)]">Each statement you import is tied to one account.</p>
        </div>
        <motion.button
          whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }}
          onClick={() => setAdding(true)}
          className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-[var(--primary)] to-[#a855f7] px-4 py-2 text-sm font-medium text-white shadow-lg shadow-[var(--primary)]/25"
        >
          <Plus className="h-4 w-4" /> Add account
        </motion.button>
      </motion.div>

      {accounts.length === 0 ? (
        <motion.div variants={fadeUp} className="rounded-2xl border border-dashed border-[var(--border)] py-16 text-center">
          <Building2 className="mx-auto mb-3 h-10 w-10 text-[var(--muted-foreground)]" />
          <p className="font-medium">No accounts yet</p>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">Add your first bank or card account to start importing statements.</p>
        </motion.div>
      ) : (
        <motion.div variants={fadeUp} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {accounts.map(a => {
            const Meta = TYPE_META[a.accountType];
            const pending = uncategorizedByAccount(a.id);
            return (
              <motion.div
                key={a.id}
                layout
                whileHover={{ y: -3 }}
                className="group relative overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5"
              >
                <div className="mb-3 flex items-start justify-between">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--primary)]/10">
                    <Meta.icon className="h-5 w-5 text-[var(--primary)]" />
                  </div>
                  <div className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                    <button onClick={() => setEditing(a)} title="Edit"
                      className="rounded-lg p-1.5 text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--foreground)]"><Pencil className="h-3.5 w-3.5" /></button>
                    <button
                      onClick={() => {
                        if (confirm(`Archive "${a.name}"? Its imported transactions are kept for audit, but the account is hidden.`))
                          actions.archiveBankAccount(a.id);
                      }}
                      title="Archive"
                      className="rounded-lg p-1.5 text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--danger)]"><Archive className="h-3.5 w-3.5" /></button>
                  </div>
                </div>
                <p className="font-semibold">{a.name}</p>
                <p className="text-sm text-[var(--muted-foreground)]">{a.bankName} · {TYPE_META[a.accountType].label}</p>
                <p className="mt-2 font-mono text-xs text-[var(--muted-foreground)]">•••• {a.accountNumberLast4 || "----"}</p>
                <div className="mt-3 flex items-center justify-between border-t border-[var(--border)] pt-3">
                  <span className="text-xs text-[var(--muted-foreground)]">Opening · {a.currency}</span>
                  <span className="font-semibold tabular-nums">{inr(a.openingBalance)}</span>
                </div>
                {pending > 0 && (
                  <div className="mt-2 inline-flex items-center gap-1 rounded-full bg-yellow-100 px-2 py-0.5 text-[11px] font-medium text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300">
                    {pending} to review
                  </div>
                )}
              </motion.div>
            );
          })}
        </motion.div>
      )}

      <AnimatePresence>
        {adding && (
          <AccountForm
            onClose={() => setAdding(false)}
            onSave={(d) => { actions.addBankAccount(d); setAdding(false); }}
          />
        )}
        {editing && (
          <AccountForm
            initial={editing}
            onClose={() => setEditing(null)}
            onSave={(d) => { actions.updateBankAccount(editing.id, d); setEditing(null); }}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}
