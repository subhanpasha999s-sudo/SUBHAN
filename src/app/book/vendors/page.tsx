"use client";
/** Vendors (V4 §6b) — manage vendor master for reuse on purchase bills. */
import { useMemo, useState } from "react";
import { Plus, Store } from "lucide-react";
import { useV2 } from "@/book/lib/v2/store";
import { Guard, EmptyState, PageHeader } from "@/book/components/v2/common";
import { Button, Card } from "@/book/components/ui";
import { formatINR } from "@/book/lib/engine";

export default function VendorsPage() {
  const { state, actions } = useV2();
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: "", gstin: "", address: "", contact: "" });

  const stats = useMemo(() => {
    const m = new Map<string, { total: number; bills: number }>();
    for (const p of state.purchases) {
      const key = p.vendorId ?? p.supplierName;
      const cur = m.get(key) ?? { total: 0, bills: 0 };
      cur.total += p.totalAmount; cur.bills++;
      m.set(key, cur);
    }
    return m;
  }, [state.purchases]);

  function save() {
    if (!form.name.trim()) return;
    actions.addVendor({ name: form.name.trim(), gstin: form.gstin.trim(), address: form.address.trim(), contact: form.contact.trim() });
    setForm({ name: "", gstin: "", address: "", contact: "" });
    setAdding(false);
  }

  const input = "rounded-xl border border-border bg-card px-3 py-2 text-sm";

  return (
    <Guard section="vendors">
      <PageHeader title="Vendors" sub="Saved suppliers — reused on purchase bills to speed up data entry"
        right={<Button onClick={() => setAdding((v) => !v)}><Plus className="h-4 w-4" /> Add vendor</Button>} />

      {adding && (
        <Card className="mb-6 p-5">
          <div className="grid gap-3 md:grid-cols-2">
            <input className={input} placeholder="Vendor name *" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <input className={input} placeholder="GSTIN" value={form.gstin} onChange={(e) => setForm({ ...form, gstin: e.target.value })} />
            <input className={input} placeholder="Contact (phone / email)" value={form.contact} onChange={(e) => setForm({ ...form, contact: e.target.value })} />
            <input className={input} placeholder="Address" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
          </div>
          <div className="mt-3 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setAdding(false)}>Cancel</Button>
            <Button onClick={save} disabled={!form.name.trim()}>Save vendor</Button>
          </div>
        </Card>
      )}

      {state.vendors.length === 0 ? (
        <EmptyState emoji="🏷️" title="No vendors yet" sub="Add your suppliers once and reuse them on every purchase bill." />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {state.vendors.map((v) => {
            const s = stats.get(v.id) ?? stats.get(v.name);
            return (
              <Card key={v.id} className="p-5">
                <div className="flex items-center gap-2">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary"><Store className="h-4 w-4" /></div>
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{v.name}</p>
                    {v.gstin && <p className="truncate text-xs text-muted-foreground">{v.gstin}</p>}
                  </div>
                </div>
                {(v.contact || v.address) && (
                  <p className="mt-2 text-xs text-muted-foreground">{[v.contact, v.address].filter(Boolean).join(" · ")}</p>
                )}
                <p className="mt-3 text-sm">
                  <span className="font-medium tabular-nums">{formatINR(s?.total ?? 0, true)}</span>{" "}
                  <span className="text-muted-foreground">across {s?.bills ?? 0} bills</span>
                </p>
              </Card>
            );
          })}
        </div>
      )}
    </Guard>
  );
}
