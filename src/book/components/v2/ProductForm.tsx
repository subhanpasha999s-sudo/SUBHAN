"use client";
/**
 * Add/Edit product modal (V4 §6a) — photo, SKU, COGS, GST inclusive/exclusive
 * toggle, GST rate, opening stock, selling rate. Full edit support.
 * (Demo stores the photo as a data URL; prod uploads to Supabase Storage.)
 */
import { useRef, useState } from "react";
import { ImagePlus, X } from "lucide-react";
import { useV2 } from "@/book/lib/v2/store";
import { Sku } from "@/book/lib/v2/types";
import { Button, cn } from "@/book/components/ui";

const GST_RATES = [0, 5, 12, 18, 28];

export default function ProductForm({ edit, onClose }: { edit?: Sku; onClose: () => void }) {
  const { actions } = useV2();
  const fileRef = useRef<HTMLInputElement>(null);
  const [f, setF] = useState<Sku>(
    edit ?? {
      skuCode: "", productName: "", category: "", sizeSet: "", currentCogs: 0,
      gstRate: 5, hsnCode: "", reorderLevel: 0, status: "active",
      gstInclusive: true, openingStock: 0, sellingRate: 0, imageUrl: undefined,
    }
  );

  function set<K extends keyof Sku>(k: K, v: Sku[K]) { setF((p) => ({ ...p, [k]: v })); }

  async function onPhoto(file: File) {
    const reader = new FileReader();
    reader.onload = () => set("imageUrl", String(reader.result));
    reader.readAsDataURL(file);
  }

  function save() {
    if (!f.skuCode.trim()) return;
    actions.upsertProduct({ ...f, skuCode: f.skuCode.trim() }, edit?.skuCode);
    onClose();
  }

  const input = "w-full rounded-xl border border-border bg-background px-3 py-2 text-sm";
  const label = "mb-1 block text-xs font-medium text-muted-foreground";

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 pt-12 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl border border-border bg-card p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center">
          <h3 className="text-lg font-semibold">{edit ? "Edit product" : "Add product"}</h3>
          <button onClick={onClose} className="ml-auto text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button>
        </div>

        <div className="flex gap-4">
          {/* photo */}
          <button onClick={() => fileRef.current?.click()}
            className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-dashed border-border bg-muted text-muted-foreground hover:border-primary">
            {f.imageUrl ? <img src={f.imageUrl} alt="" className="h-full w-full object-cover" /> : <ImagePlus className="h-6 w-6" />}
          </button>
          <input ref={fileRef} type="file" accept="image/*" className="hidden"
            onChange={(e) => { const file = e.target.files?.[0]; if (file) onPhoto(file); e.target.value = ""; }} />
          <div className="flex-1 space-y-2">
            <div>
              <label className={label}>SKU code *</label>
              <input className={input} value={f.skuCode} onChange={(e) => set("skuCode", e.target.value)} placeholder="KURTI-RED-M" />
            </div>
            <div>
              <label className={label}>Product name</label>
              <input className={input} value={f.productName} onChange={(e) => set("productName", e.target.value)} />
            </div>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-3">
          <div>
            <label className={label}>Category</label>
            <input className={input} value={f.category} onChange={(e) => set("category", e.target.value)} />
          </div>
          <div>
            <label className={label}>Size set</label>
            <input className={input} value={f.sizeSet} onChange={(e) => set("sizeSet", e.target.value)} />
          </div>
          <div>
            <label className={label}>COGS ₹/unit</label>
            <input className={input} type="number" inputMode="decimal" value={f.currentCogs || ""} onChange={(e) => set("currentCogs", parseFloat(e.target.value) || 0)} />
          </div>
          <div>
            <label className={label}>Selling rate ₹</label>
            <input className={input} type="number" inputMode="decimal" value={f.sellingRate || ""} onChange={(e) => set("sellingRate", parseFloat(e.target.value) || 0)} />
          </div>
          <div>
            <label className={label}>GST rate</label>
            <select className={input} value={f.gstRate} onChange={(e) => set("gstRate", parseFloat(e.target.value))}>
              {GST_RATES.map((r) => <option key={r} value={r}>{r}%</option>)}
            </select>
          </div>
          <div>
            <label className={label}>GST mode</label>
            <div className="flex rounded-xl bg-muted p-1 text-sm">
              {([["Inclusive", true], ["Exclusive", false]] as const).map(([t, v]) => (
                <button key={t} onClick={() => set("gstInclusive", v)}
                  className={cn("flex-1 rounded-lg py-1.5", (f.gstInclusive ?? true) === v && "bg-card font-medium shadow-card")}>{t}</button>
              ))}
            </div>
          </div>
          <div>
            <label className={label}>HSN code</label>
            <input className={input} value={f.hsnCode} onChange={(e) => set("hsnCode", e.target.value)} />
          </div>
          <div>
            <label className={label}>Reorder level</label>
            <input className={input} type="number" inputMode="numeric" value={f.reorderLevel || ""} onChange={(e) => set("reorderLevel", parseInt(e.target.value, 10) || 0)} />
          </div>
          {!edit && (
            <div>
              <label className={label}>Opening stock</label>
              <input className={input} type="number" inputMode="numeric" value={f.openingStock || ""} onChange={(e) => set("openingStock", parseInt(e.target.value, 10) || 0)} />
            </div>
          )}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={!f.skuCode.trim()}>{edit ? "Save changes" : "Add product"}</Button>
        </div>
      </div>
    </div>
  );
}
