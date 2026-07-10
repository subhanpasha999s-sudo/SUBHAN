"use client";
/** Vendors (V4 §6b) — manage vendor master for reuse on purchase bills. */
import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, Store, Download, Upload } from "lucide-react";
import Papa from "papaparse";
import { useV2 } from "@/book/lib/v2/store";
import { Guard, EmptyState, PageHeader } from "@/book/components/v2/common";
import { Button, Card } from "@/book/components/ui";
import { formatINR } from "@/book/lib/engine";
import { flags } from "@/book/lib/flags";
import { vendorsToCsv, recordsToContactRows } from "@/book/lib/core/contacts";

function downloadCsv(filename: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function VendorsPage() {
  const { state, actions } = useV2();
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: "", gstin: "", address: "", contact: "" });
  const [importMsg, setImportMsg] = useState<string | null>(null);
  useEffect(() => {
    if (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("new") === "1") setAdding(true);
  }, []);
  const fileRef = useRef<HTMLInputElement>(null);

  function onImportFile(file: File) {
    Papa.parse<Record<string, unknown>>(file, {
      header: true,
      skipEmptyLines: "greedy",
      complete: (res) => {
        const rows = recordsToContactRows(res.data);
        if (rows.length === 0) { setImportMsg("No rows with a name column found."); return; }
        const r = actions.importVendors(rows);
        setImportMsg(`Imported ${r.added} vendor${r.added === 1 ? "" : "s"} (${r.skipped} duplicates skipped).`);
      },
      error: () => setImportMsg("Couldn't read that CSV file."),
    });
  }

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
        right={
          <div className="flex flex-wrap gap-2">
            {flags.contactsPlus && (
              <>
                <Button variant="secondary" onClick={() => downloadCsv("vendors.csv", vendorsToCsv(state.vendors))}>
                  <Download className="h-4 w-4" /> Export
                </Button>
                <Button variant="secondary" onClick={() => fileRef.current?.click()}>
                  <Upload className="h-4 w-4" /> Import
                </Button>
                <input ref={fileRef} type="file" accept=".csv" className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) onImportFile(f); e.target.value = ""; }} />
              </>
            )}
            <Button onClick={() => setAdding((v) => !v)}><Plus className="h-4 w-4" /> Add vendor</Button>
          </div>
        } />

      {importMsg && <Card className="mb-4 px-4 py-2.5 text-sm text-muted-foreground">{importMsg}</Card>}

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
