"use client";
/**
 * SKU Mapping (V3 §2) — connect Meesho listing SKUs to inventory SKUs.
 * Upgraded for speed: one-click auto-map all suggestions, a mapped/to-go
 * progress bar, and search across both columns. Mapping is retroactive —
 * resolving applies to past orders' inventory.
 */
import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check, Layers, Plus, Search, Sparkles, Trash2, Wand2, X } from "lucide-react";
import { useV2 } from "@/book/lib/v2/store";
import { unmappedTray } from "@/book/lib/v2/derived";
import { Guard, EmptyState, PageHeader } from "@/book/components/v2/common";
import { Badge, Button, Card, cn } from "@/book/components/ui";
import { SkuMapEntry } from "@/book/lib/engine";

const AUTO_THRESHOLD = 0.5; // min suggestion score eligible for one-click auto-map

export default function MappingPage() {
  const { state, actions } = useV2();
  const tray = useMemo(() => unmappedTray(state), [state]);
  const [mapping, setMapping] = useState<string | null>(null); // listingSku being mapped
  const [target, setTarget] = useState("");
  const [bundleMode, setBundleMode] = useState(false);
  const [bundleRows, setBundleRows] = useState<{ sku: string; qty: string }[]>([{ sku: "", qty: "1" }]);
  const [createCode, setCreateCode] = useState("");
  const [traySearch, setTraySearch] = useState("");
  const [mapSearch, setMapSearch] = useState("");

  const invOptions = useMemo(() => state.skus.filter((s) => s.status === "active"), [state.skus]);

  // Progress + bulk auto-map candidates
  const mappedCount = state.skuMap.length;
  const total = mappedCount + tray.length;
  const pct = total === 0 ? 100 : Math.round((mappedCount / total) * 100);
  const autoMappable = useMemo(
    () => tray.filter((u) => u.suggestion && u.suggestion.score >= AUTO_THRESHOLD),
    [tray]
  );

  const filteredTray = useMemo(() => {
    const q = traySearch.trim().toLowerCase();
    if (!q) return tray;
    return tray.filter((u) => u.listingSku.toLowerCase().includes(q) || (u.productName ?? "").toLowerCase().includes(q));
  }, [tray, traySearch]);

  const filteredMap = useMemo(() => {
    const q = mapSearch.trim().toLowerCase();
    if (!q) return state.skuMap;
    return state.skuMap.filter((e) =>
      e.listingSku.toLowerCase().includes(q) ||
      (e.inventorySku ?? "").toLowerCase().includes(q) ||
      (e.components ?? []).some((c) => c.inventorySku.toLowerCase().includes(q))
    );
  }, [state.skuMap, mapSearch]);

  function autoMapAll() {
    const entries: SkuMapEntry[] = autoMappable.map((u) => ({
      listingSku: u.listingSku, inventorySku: u.suggestion!.skuCode, marketplace: "meesho",
    }));
    actions.mapSkuBulk(entries);
  }

  function beginMap(listingSku: string, suggestion?: string) {
    setMapping(listingSku);
    setTarget(suggestion ?? "");
    setBundleMode(false);
    setBundleRows([{ sku: "", qty: "1" }]);
    setCreateCode("");
  }

  function commitSimple(listingSku: string, inventorySku: string) {
    if (!inventorySku) return;
    actions.mapSku({ listingSku, inventorySku, marketplace: "meesho" });
    setMapping(null);
  }

  function commitBundle(listingSku: string) {
    const components = bundleRows
      .map((r) => ({ inventorySku: r.sku, qty: parseInt(r.qty, 10) || 0 }))
      .filter((c) => c.inventorySku && c.qty > 0);
    if (components.length === 0) return;
    actions.mapSku({ listingSku, components, marketplace: "meesho" });
    setMapping(null);
  }

  function quickCreateAndMap(listingSku: string) {
    const code = createCode.trim();
    if (!code) return;
    actions.quickCreateSku({ skuCode: code, productName: state.orders.find((o) => o.sku === listingSku)?.productName ?? code });
    actions.mapSku({ listingSku, inventorySku: code, marketplace: "meesho" });
    setMapping(null);
  }

  const labelFor = (e: SkuMapEntry) =>
    e.components?.length
      ? `bundle · ${e.components.map((c) => `${c.inventorySku}×${c.qty}`).join(" + ")}`
      : `→ ${e.inventorySku}`;

  const searchBox = (value: string, onChange: (v: string) => void, placeholder: string) => (
    <div className="relative ml-auto w-40">
      <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-border bg-card py-1 pl-7 pr-2 text-xs outline-none focus:border-primary"
      />
    </div>
  );

  return (
    <Guard section="mapping">
      <PageHeader
        title="SKU Mapping"
        sub="Connect Meesho listing SKUs to your inventory SKUs so stock math stays correct. Mapping applies retroactively."
      />

      {/* Progress + one-click auto-map */}
      <Card className="mb-6 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-medium">
              {mappedCount} mapped · <span className={cn(tray.length > 0 && "text-warning")}>{tray.length} to go</span>
            </p>
            <p className="text-xs text-muted-foreground">{pct}% of listing SKUs connected to inventory</p>
          </div>
          {autoMappable.length > 0 && (
            <motion.div whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }}>
              <Button onClick={autoMapAll} className="gap-1.5">
                <Wand2 className="h-4 w-4" /> Auto-map {autoMappable.length} suggestion{autoMappable.length > 1 ? "s" : ""}
              </Button>
            </motion.div>
          )}
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
          <motion.div
            className="h-full rounded-full bg-gradient-to-r from-[var(--primary)] to-[#a855f7]"
            initial={{ width: 0 }}
            animate={{ width: `${pct}%` }}
            transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          />
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Unmapped tray */}
        <Card className="overflow-hidden">
          <div className="flex items-center gap-2 border-b border-border px-4 py-3">
            <span className="font-semibold">Unmapped listing SKUs</span>
            {tray.length > 0 && <Badge tone="warning">{tray.length}</Badge>}
            {tray.length > 0 && searchBox(traySearch, setTraySearch, "Search…")}
          </div>
          {tray.length === 0 ? (
            <EmptyState emoji="✨" title="Everything is mapped" sub="New listing SKUs from future imports will appear here." />
          ) : filteredTray.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">No matches for “{traySearch}”.</p>
          ) : (
            <div className="divide-y divide-border">
              <AnimatePresence initial={false}>
              {filteredTray.map((u) => (
                <motion.div
                  key={u.listingSku}
                  layout
                  initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, height: 0 }}
                  className="px-4 py-3"
                >
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-mono text-sm font-medium">{u.listingSku}</p>
                      <p className="truncate text-xs text-muted-foreground">{u.productName} · {u.orderCount} orders · excluded from inventory</p>
                    </div>
                    {mapping !== u.listingSku && (
                      <div className="flex shrink-0 gap-1.5">
                        {u.suggestion && (
                          <button
                            onClick={() => commitSimple(u.listingSku, u.suggestion!.skuCode)}
                            className="inline-flex items-center gap-1 rounded-lg bg-violet-100 px-2 py-1 text-xs font-medium text-violet-800 dark:bg-violet-950 dark:text-violet-300"
                            title={`Auto-suggest (${Math.round(u.suggestion.score * 100)}% match)`}
                          >
                            <Sparkles className="h-3 w-3" /> {u.suggestion.skuCode}
                          </button>
                        )}
                        <Button variant="secondary" className="px-2 py-1 text-xs" onClick={() => beginMap(u.listingSku, u.suggestion?.skuCode)}>
                          Map
                        </Button>
                      </div>
                    )}
                  </div>

                  <AnimatePresence>
                    {mapping === u.listingSku && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
                        className="mt-3 space-y-2 overflow-hidden rounded-xl bg-muted p-3"
                      >
                        <div className="flex items-center gap-2 text-xs">
                          <button onClick={() => setBundleMode(false)} className={cn("rounded-lg px-2 py-1", !bundleMode && "bg-card font-medium shadow-card")}>Single SKU</button>
                          <button onClick={() => setBundleMode(true)} className={cn("inline-flex items-center gap-1 rounded-lg px-2 py-1", bundleMode && "bg-card font-medium shadow-card")}><Layers className="h-3 w-3" /> Bundle / kit</button>
                          <button onClick={() => setMapping(null)} className="ml-auto text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
                        </div>

                        {!bundleMode ? (
                          <div className="flex flex-wrap items-center gap-2">
                            <select value={target} onChange={(e) => setTarget(e.target.value)} className="flex-1 rounded-lg border border-border bg-card px-2 py-1.5 text-sm">
                              <option value="">Choose inventory SKU…</option>
                              {invOptions.map((s) => <option key={s.skuCode} value={s.skuCode}>{s.skuCode} — {s.productName}</option>)}
                            </select>
                            <Button className="px-3 py-1.5 text-sm" onClick={() => commitSimple(u.listingSku, target)} disabled={!target}>
                              <Check className="h-4 w-4" /> Map
                            </Button>
                          </div>
                        ) : (
                          <div className="space-y-2">
                            {bundleRows.map((r, i) => (
                              <div key={i} className="flex items-center gap-2">
                                <select value={r.sku} onChange={(e) => setBundleRows(bundleRows.map((x, j) => j === i ? { ...x, sku: e.target.value } : x))} className="flex-1 rounded-lg border border-border bg-card px-2 py-1.5 text-sm">
                                  <option value="">Component SKU…</option>
                                  {invOptions.map((s) => <option key={s.skuCode} value={s.skuCode}>{s.skuCode}</option>)}
                                </select>
                                <input value={r.qty} onChange={(e) => setBundleRows(bundleRows.map((x, j) => j === i ? { ...x, qty: e.target.value } : x))} className="w-16 rounded-lg border border-border bg-card px-2 py-1.5 text-right text-sm" placeholder="qty" inputMode="numeric" />
                                {bundleRows.length > 1 && <button onClick={() => setBundleRows(bundleRows.filter((_, j) => j !== i))} className="text-muted-foreground hover:text-danger"><Trash2 className="h-3.5 w-3.5" /></button>}
                              </div>
                            ))}
                            <div className="flex gap-2">
                              <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => setBundleRows([...bundleRows, { sku: "", qty: "1" }])}>+ component</Button>
                              <Button className="ml-auto px-3 py-1.5 text-sm" onClick={() => commitBundle(u.listingSku)}>Save bundle</Button>
                            </div>
                          </div>
                        )}

                        <div className="flex items-center gap-2 border-t border-border pt-2 text-xs">
                          <Plus className="h-3 w-3 text-muted-foreground" />
                          <input value={createCode} onChange={(e) => setCreateCode(e.target.value)} placeholder="…or quick-create new inventory SKU code" className="flex-1 rounded-lg border border-border bg-card px-2 py-1.5" />
                          <Button variant="secondary" className="px-2 py-1 text-xs" onClick={() => quickCreateAndMap(u.listingSku)} disabled={!createCode.trim()}>Create &amp; map</Button>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              ))}
              </AnimatePresence>
            </div>
          )}
        </Card>

        {/* Existing mappings */}
        <Card className="overflow-hidden">
          <div className="flex items-center gap-2 border-b border-border px-4 py-3">
            <span className="font-semibold">Active mappings</span>
            <Badge>{state.skuMap.length}</Badge>
            {state.skuMap.length > 0 && searchBox(mapSearch, setMapSearch, "Search…")}
          </div>
          <div className="max-h-[32rem] divide-y divide-border overflow-y-auto">
            <AnimatePresence initial={false}>
            {filteredMap.map((e) => (
              <motion.div
                key={e.listingSku}
                layout
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, height: 0 }}
                className="flex items-center gap-2 px-4 py-2.5"
              >
                <div className="min-w-0">
                  <p className="truncate font-mono text-sm">{e.listingSku}</p>
                  <p className="truncate text-xs text-muted-foreground">{labelFor(e)}</p>
                </div>
                {e.components?.length ? <Badge tone="info" className="ml-auto">bundle</Badge> : <span className="ml-auto" />}
                <button onClick={() => actions.unmapSku(e.listingSku)} className="text-muted-foreground hover:text-danger" title="Remove mapping">
                  <Trash2 className="h-4 w-4" />
                </button>
              </motion.div>
            ))}
            </AnimatePresence>
            {state.skuMap.length === 0 && <p className="px-4 py-8 text-center text-sm text-muted-foreground">No mappings yet.</p>}
            {state.skuMap.length > 0 && filteredMap.length === 0 && <p className="px-4 py-8 text-center text-sm text-muted-foreground">No matches for “{mapSearch}”.</p>}
          </div>
        </Card>
      </div>
    </Guard>
  );
}
