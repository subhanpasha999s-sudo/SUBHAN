"use client";
/**
 * V2 data provider — DEMO MODE implementation (in-browser, localStorage).
 *
 * Every action body is the demo equivalent of a server action; the Supabase
 * implementation maps each one onto inserts guarded by requireRole()
 * (src/lib/supabase/server.ts) with RLS underneath.
 * PHASE2: swap persistence to Supabase — the component tree only talks to
 * this context, so screens don't change.
 */
import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  AdsRow,
  LedgerEvent,
  OrderRow,
  PaymentRow,
  SkuMapEntry,
  UploadResult,
  adsAutoExpense,
  applyPaymentUpload,
  buildSkuMap,
  canonicalizeOrders,
  classifyReconciled,
  isExchangeThenReturn,
  qcReturnTypesFor,
  hintFromCategorization,
  ledgerEventsForOrderMapped,
  paymentRowToEvent,
  qcDecisionEvent,
  QcResult,
  weightedAvgCogs,
  currentStock,
} from "@/book/lib/engine";
import { canDo } from "./rbac";
import { dedupeByName, mergeCustomerRecords, type ContactCsvRow } from "@/book/lib/core/contacts";
import { computeDueRuns, firstRunDate, daysOverdue, invoiceOutstanding, shouldRemind } from "@/book/lib/core/salesDocs";
import { allocateLandedCost, receivedBillTotals } from "@/book/lib/core/purchaseDocs";
import { buildEmptyState } from "./emptyState";
import { loadBookState, saveBookState, isBookAuthed } from "@/book/lib/bookStateRemote";
import {
  AppNotification, BankAccount, BillPayment, CategorizationRule, Claim, CreditNote, Customer, Estimate, Invoice,
  Receipt, RecurringInvoice, PurchaseOrder, VendorCredit,
  OrgUser, Purchase, ReturnsQueueItem, SavedBankMapping, Sku, StagedBankTxn, StoredBankTxn,
  StoredExpense, UploadRecord, V2State, Vendor,
} from "./types";

/**
 * Rebuild ALL order-derived ledger rows (and the pending QC queue) from the
 * current orders + sku map. Purchase/adjustment/QC rows are preserved; only
 * rows whose refType is "order" are recomputed. Used after a mapping change so
 * retroactive mappings flow into inventory (spec §2).
 */
function rebuildOrderLedger(state: V2State): { ledger: LedgerEvent[]; returnsQueue: ReturnsQueueItem[] } {
  const map = buildSkuMap(state.skuMap);
  // keep non-order ledger rows (purchases, manual adjustments, QC, labels)
  const ledger: LedgerEvent[] = state.ledger.filter((l) => l.refType !== "order");
  // keep QC entries the user already acted on; drop stale PENDING order-derived ones
  const resolvedQueue = state.returnsQueue.filter((r) => r.qcStatus === "DONE");
  const resolvedKeys = new Set(resolvedQueue.map((r) => `${r.subOrderNo}|${r.skuCode}|${r.returnType}`));
  const queue: ReturnsQueueItem[] = [...resolvedQueue];
  for (const o of state.orders) {
    const orderEvents = state.events.filter((e) => e.subOrderNo === o.subOrderNo);
    const cls = classifyReconciled(o, orderEvents);
    // Delivered → Exchange → Return: both the original and the replacement came
    // back, so the ledger gets two return legs and the queue two QC entries.
    const exchangeThenReturn = isExchangeThenReturn(o, orderEvents);
    // inventory ledger movement is mapping-gated (unmapped → no stock effect)
    const { events } = ledgerEventsForOrderMapped(o, cls, o.orderDate || "", map, { exchangeThenReturn });
    ledger.push(...events);
    // QC queue is NOT mapping-gated — every RTO / Customer Return / Exchange
    // creates a QC-pending entry, keyed on the order's listing SKU. An
    // exchange-then-return yields two entries (CUSTOMER_RETURN + EXCHANGE_RETURN).
    for (const qcType of qcReturnTypesFor(o, orderEvents)) {
      const key = `${o.subOrderNo}|${o.sku}|${qcType}`;
      if (!resolvedKeys.has(key)) {
        queue.push({
          id: `rq-${queue.length + 1}-${o.subOrderNo}`, subOrderNo: o.subOrderNo, skuCode: o.sku,
          returnType: qcType, receivedDate: o.orderDate || null, qcStatus: "PENDING",
          qcResult: null, qcNotes: "", qcBy: null, restocked: false, createdAt: o.orderDate || new Date().toISOString(),
        });
      }
    }
  }
  return { ledger, returnsQueue: queue };
}

// v3 key: starts clean; abandons any previously-seeded demo data under v2.
const KEY = "meeshoprofit:v3";
// The SKU map persists in its OWN small key so it survives data deletion and
// even a quota failure on the big state blob (it's tiny and always writable).
const SKUMAP_KEY = "meeshoprofit:skumap";
let nextId = 1;
const uid = (p: string) => `${p}-${Date.now().toString(36)}-${nextId++}`;
const todayIso = () => new Date().toISOString().slice(0, 10);
const formatReceived = (n: number) =>
  `₹${Math.round(n).toLocaleString("en-IN")}`;

/** Payment import result + V4 reproducible summary numbers (§1a). */
export type PaymentImportResult = UploadResult & {
  rowsRead: number;       // payment rows with a Sub Order No
  matchedRows: number;    // rows whose sub order exists in the order file
  unmatchedRows: number;  // rows with no matching order (unacknowledged payouts)
  fileReceived: number;   // Σ Final Settlement Amount in this file
};

export interface V2Actions {
  switchUser(userId: string): void;
  resetDemo(): void;
  /** Delete a single imported file and the records it brought in. */
  deleteUpload(uploadId: string): void;
  /** Delete ALL imported order/payment data (keeps SKUs, vendors, settings). */
  clearImportedData(): void;
  /** Ingest a parsed payment file (idempotent). Returns the what-changed summary. */
  ingestPaymentFile(args: {
    fileName: string; fileHash: string; monthBucket: string;
    paymentRows: PaymentRow[]; adsRows: AdsRow[];
  }): PaymentImportResult | { error: string };
  ingestOrderFile(args: { fileName: string; fileHash: string; orderRows: OrderRow[] }):
    { newOrders: number; rawRows: number; uniqueOrders: number; merged: number } | { error: string };
  qcDecision(itemId: string, result: QcResult, notes?: string): void;
  addPurchase(p: Omit<Purchase, "id">): string;
  /** Phase 4 — purchase orders + vendor credits. */
  addPurchaseOrder(po: Omit<PurchaseOrder, "id" | "number" | "status" | "date"> & { date?: string }): string;
  cancelPurchaseOrder(id: string): void;
  receivePurchaseOrder(id: string): { ok: boolean; message?: string; purchaseId?: string };
  addVendorCredit(purchaseId: string, amount: number, reason?: string): { ok: boolean; message?: string };
  overrideCogs(skuCode: string, newCogs: number): void;
  updateSku(skuCode: string, patch: Partial<Sku>): void;
  /** V4 §6a — create or fully edit a product. */
  upsertProduct(sku: Sku, originalCode?: string): void;
  /** V4 §6b — add a vendor to the master. */
  addVendor(v: Omit<Vendor, "id" | "createdAt">): void;
  /** Phase 3 — sales/AR. */
  addCustomer(c: Omit<Customer, "id" | "createdAt">): string;
  addInvoice(i: Omit<Invoice, "id" | "amountPaid" | "status">): string;
  recordInvoiceReceipt(invoiceId: string, amount: number): void;
  /** Phase 3 — credit note against an invoice (clamped to outstanding, auto-applied). */
  addCreditNote(invoiceId: string, amount: number, reason?: string): { ok: boolean; message?: string };
  /** Phase 3 — estimates (quotes) and recurring invoices. */
  addEstimate(e: { customerId: string; amount: number; date: string; expiryDate?: string; notes?: string }): string;
  setEstimateStatus(id: string, status: "accepted" | "declined"): void;
  convertEstimateToInvoice(id: string): { ok: boolean; message?: string; invoiceId?: string };
  addRecurringInvoice(r: { customerId: string; amount: number; dayOfMonth: number; notes?: string }): string;
  toggleRecurringInvoice(id: string, active: boolean): void;
  /** Materialize all due recurring invoices (client-side scheduler; idempotent). */
  runRecurringInvoices(): { created: number };
  /** Raise overdue-invoice reminders (throttled to once per 7 days per invoice). */
  runPaymentReminders(): { reminded: number };
  /** Manual nudge for one invoice (resets its reminder clock). */
  remindInvoice(id: string): void;
  /** Phase 2 (upgrade spec §5.2) — contacts management. */
  updateCustomer(id: string, patch: Partial<Omit<Customer, "id" | "createdAt">>): void;
  mergeCustomers(keepId: string, mergedId: string): { ok: boolean; message?: string };
  importCustomers(rows: ContactCsvRow[]): { added: number; skipped: number };
  updateVendor(id: string, patch: Partial<Omit<Vendor, "id" | "createdAt">>): void;
  importVendors(rows: ContactCsvRow[]): { added: number; skipped: number };
  /** Phase 4 — record a payment against a purchase bill (DR AP / CR Cash). */
  recordBillPayment(purchaseId: string, amount: number): void;
  addExpense(e: Omit<StoredExpense, "id" | "createdBy">): void;
  deleteExpense(id: string): void;
  importBankTxns(txns: Omit<StoredBankTxn, "id" | "status">[]): void;
  categorizeBankTxn(id: string, category: string | null): void; // null = ignore
  addClaim(c: Omit<Claim, "id">): void;
  updateClaim(id: string, patch: Partial<Claim>): void;
  markDisputed(subOrderNo: string, disputed: boolean): void;
  stockAdjustment(skuCode: string, delta: number, reason: string): void;
  printLabels(items: { skuCode: string; count: number }[]): void;
  inviteUser(u: Omit<OrgUser, "id" | "active">): void;
  setSettleAfterDays(days: number): void;
  /** V3: map a listing SKU (retroactively rebuilds affected inventory ledger). */
  mapSku(entry: SkuMapEntry): void;
  /** Map many listing SKUs in one rebuild (fast bulk auto-map). */
  mapSkuBulk(entries: SkuMapEntry[]): void;
  /** V3: remove a listing→inventory mapping (pushes orders back to the tray). */
  unmapSku(listingSku: string): void;
  /** V3: quick-create an inventory SKU inline from the mapping screen. */
  quickCreateSku(sku: Partial<Sku> & { skuCode: string }): void;
  markNotificationsRead(): void;
  // ── Bank import staging ────────────────────────────────────────────
  setStagingTxns(txns: StagedBankTxn[]): void;
  updateStagingTxn(id: string, patch: Partial<StagedBankTxn>): void;
  clearStaging(): void;
  /** Move confirmed staging txns to bankTxns and clear staging. */
  confirmBankImport(txns: StagedBankTxn[]): void;
  saveBankMapping(m: SavedBankMapping): void;
  addCategorizationRule(r: Omit<CategorizationRule, "id" | "createdAt" | "timesMatched">): void;
  updateCategorizationRule(id: string, patch: Partial<CategorizationRule>): void;
  deleteCategorizationRule(id: string): void;
  // ── Bank accounts (§2.1) ───────────────────────────────────────────
  addBankAccount(a: Omit<BankAccount, "id" | "createdAt">): void;
  updateBankAccount(id: string, patch: Partial<BankAccount>): void;
  archiveBankAccount(id: string): void;
}

/** Cloud-sync state for the signed-in user's Supabase book_state row. */
export type CloudStatus = "off" | "saving" | "saved" | "error";

const Ctx = createContext<{ state: V2State; me: OrgUser; actions: V2Actions; persistError: boolean; cloudStatus: CloudStatus } | null>(null);

export function useV2() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useV2 outside provider");
  return v;
}

export function V2Provider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<V2State | null>(null);
  const [persistError, setPersistError] = useState(false);
  const [cloudStatus, setCloudStatus] = useState<CloudStatus>("off");
  const stateRef = useRef<V2State | null>(null);
  stateRef.current = state;
  // Gates cloud writes until we've read the cloud once — so a fresh/empty local
  // state can never clobber the user's saved server data during hydration.
  const hydratedRef = useRef(false);

  // Self-heal the order-derived ledger + QC queue (pure fn of orders+events+map).
  const heal = (s: V2State): V2State => {
    if (s.orders?.length) {
      try { const r = rebuildOrderLedger(s); s.ledger = r.ledger; s.returnsQueue = r.returnsQueue; } catch { /* keep as-is */ }
    }
    return s;
  };

  useEffect(() => {
    // 1) Instant first paint from the localStorage cache.
    let local: V2State;
    try {
      const raw = localStorage.getItem(KEY);
      local = raw ? (JSON.parse(raw) as V2State) : buildEmptyState();
    } catch {
      local = buildEmptyState();
    }
    try { const sm = localStorage.getItem(SKUMAP_KEY); if (sm) local.skuMap = JSON.parse(sm); } catch { /* keep */ }
    setState(heal(local));

    // 2) Hydrate from Supabase (source of truth when signed in); on first
    //    sign-in with only local data, seed the cloud from it.
    let cancelled = false;
    void (async () => {
      try {
        const remote = await loadBookState();
        if (cancelled) return;
        if (remote) {
          // merge over current defaults so newly-added V2State fields exist
          setState(heal({ ...buildEmptyState(), ...remote }));
          setCloudStatus("saved");
        } else if (await isBookAuthed()) {
          const res = await saveBookState(local);
          setCloudStatus(res.ok ? "saved" : "error");
        }
      } catch { /* stay on local cache */ }
      finally { hydratedRef.current = true; }
    })();
    return () => { cancelled = true; };
  }, []);

  // Local cache write — instant, offline-safe; surfaces quota failures.
  useEffect(() => {
    if (!state) return;
    try { localStorage.setItem(SKUMAP_KEY, JSON.stringify(state.skuMap)); } catch { /* unlikely */ }
    try { localStorage.setItem(KEY, JSON.stringify(state)); setPersistError(false); } catch { setPersistError(true); }
  }, [state]);

  // Debounced cloud write — the durable, per-user source of truth. When signed
  // in, THIS (not localStorage) is what persists data and syncs it across
  // devices, so a full local cache is no longer data loss.
  useEffect(() => {
    if (!state || !hydratedRef.current) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      const res = await saveBookState(state);
      if (cancelled) return;
      setCloudStatus(res.ok ? "saved" : res.message === "Not signed in." ? "off" : "error");
    }, 1200);
    return () => { cancelled = true; clearTimeout(t); };
  }, [state]);

  const value = useMemo(() => {
    if (!state) return null;
    const me = state.users.find((u) => u.id === state.currentUserId) ?? state.users[0];

    const audit = (action: string, entity: string, entityId: string, details?: string) => ({
      at: new Date().toISOString(), actor: me.name, action, entity, entityId, details,
    });

    const guard = (action: Parameters<typeof canDo>[1]) => {
      // layer 2 (server-action equivalent): refuse mutations the role lacks
      if (!canDo(me.role, action)) throw new Error(`Role ${me.role} cannot ${action}`);
    };

    const actions: V2Actions = {
      switchUser: (userId) => setState((s) => s && { ...s, currentUserId: userId }),
      resetDemo: () => setState(buildEmptyState()),

      deleteUpload: (uploadId) => {
        guard("upload_files");
        setState((cur) => {
          if (!cur) return cur;
          const up = cur.uploads.find((u) => u.id === uploadId);
          if (!up) return cur;
          let orders = cur.orders;
          let events = cur.events;
          let expenses = cur.expenses;
          if (up.fileType === "ORDERS_CSV") {
            orders = cur.orders.filter((o) => o.sourceFile !== up.fileName);
          } else if (up.fileType === "PAYMENTS_XLSX") {
            events = cur.events.filter((e) => e.sourceFile !== up.fileName);
            // drop the auto ads expense for this file's month if no other
            // payment file for that month remains
            const monthStillCovered = cur.uploads.some(
              (u) => u.id !== uploadId && u.fileType === "PAYMENTS_XLSX" && u.monthLabel === up.monthLabel
            );
            if (!monthStillCovered) {
              expenses = expenses.filter(
                (e) => !(e.source === "ADS_AUTO" && e.sourceKey === `ads:${up.monthLabel}`)
              );
            }
          }
          const uploads = cur.uploads.filter((u) => u.id !== uploadId);
          const rebuilt = rebuildOrderLedger({ ...cur, orders, events });
          return {
            ...cur, orders, events, expenses, uploads,
            ledger: rebuilt.ledger, returnsQueue: rebuilt.returnsQueue,
            audit: [...cur.audit, audit("DELETE_UPLOAD", up.fileType, up.fileName,
              `removed ${up.fileName} (${up.rowCount} rows)`)],
          };
        });
      },

      clearImportedData: () => {
        guard("upload_files");
        setState((cur) => {
          if (!cur) return cur;
          // keep SKUs, vendors, mappings, purchases, manual expenses, settings,
          // users; drop everything brought in by order/payment imports.
          const ledger = cur.ledger.filter((l) => l.refType === "purchase" || l.refType === "manual");
          const expenses = cur.expenses.filter((e) => e.source !== "ADS_AUTO");
          return {
            ...cur,
            orders: [], events: [], uploads: [], returnsQueue: [], disputed: [],
            ledger, expenses,
            notifications: [...cur.notifications, {
              id: uid("n"), at: new Date().toISOString(), kind: "info" as const,
              title: "Imported data cleared",
              body: "All order & payment imports were removed. Your products, vendors and settings are kept.",
              read: false,
            }],
            audit: [...cur.audit, audit("CLEAR_IMPORTS", "data", "all", "cleared all imported order & payment data")],
          };
        });
      },

      ingestPaymentFile: ({ fileName, fileHash, monthBucket, paymentRows, adsRows }) => {
        guard("upload_files");
        const s = stateRef.current!;
        if (s.uploads.some((u) => u.fileHash === fileHash)) {
          return { error: "This exact file was already uploaded (same content hash)." };
        }
        const incoming = paymentRows.map((r) => paymentRowToEvent(r, monthBucket, fileName));
        const orderMap = new Map(s.orders.map((o) => [o.subOrderNo, o]));
        const result = applyPaymentUpload(orderMap, s.events, incoming);

        // Rebuild ledger + QC queue from full orders + all events so every
        // return/RTO/failed-exchange confirmed by payment becomes QC-pending.
        const nextState: V2State = { ...s, events: [...s.events, ...result.newEvents] };
        const rebuilt = rebuildOrderLedger(nextState);
        const ledger = rebuilt.ledger;
        const queue = rebuilt.returnsQueue;

        // import-summary numbers (V4 §1a) — reproducible, file-scoped
        const fileReceived = Math.round(incoming.reduce((a, e) => a + e.finalSettlement, 0) * 100) / 100;
        const matchedRows = incoming.filter((e) => orderMap.has(e.subOrderNo)).length;
        const unmatchedRows = incoming.length - matchedRows;

        const expenses = [...s.expenses];
        const ads = adsAutoExpense(adsRows, monthBucket);
        if (ads) {
          const idx = expenses.findIndex((e) => e.source === "ADS_AUTO" && e.sourceKey === ads.sourceKey);
          if (idx >= 0) expenses[idx] = { ...expenses[idx], ...ads };
          else expenses.push({ ...ads, id: uid("ex"), createdBy: "system" });
        }

        const upload: UploadRecord = {
          id: uid("up"), fileName, fileType: "PAYMENTS_XLSX", fileHash,
          monthLabel: monthBucket, rowCount: paymentRows.length,
          matched: incoming.filter((e) => orderMap.has(e.subOrderNo)).length,
          unmatched: incoming.filter((e) => !orderMap.has(e.subOrderNo)).length,
          at: new Date().toISOString(),
        };
        const note: AppNotification = {
          id: uid("n"), at: new Date().toISOString(), kind: "import",
          title: `${monthBucket} payment imported`,
          body: `${formatReceived(result.summary.totalReceived)} received · ${result.summary.ordersUpdated} orders updated · ${result.summary.reclassified.length} reclassified.`,
          read: false,
        };
        setState((cur) => cur && {
          ...cur,
          events: [...cur.events, ...result.newEvents],
          ledger, returnsQueue: queue, expenses,
          uploads: [...cur.uploads, upload],
          notifications: [...cur.notifications, note],
          audit: [...cur.audit, audit("UPLOAD", fileName, upload.id,
            `${result.summary.ordersUpdated} orders updated · ${result.summary.newSettlements} new settlements`)],
        });
        return { ...result, rowsRead: incoming.length, matchedRows, unmatchedRows, fileReceived };
      },

      ingestOrderFile: ({ fileName, fileHash, orderRows }) => {
        guard("upload_files");
        const s = stateRef.current!;
        if (s.uploads.some((u) => u.fileHash === fileHash)) {
          return { error: "This exact file was already uploaded (same content hash)." };
        }
        // Canonical order identity: collapse multi-row Sub Order Nos into one
        // canonical order (exchange/cancel-line merges) — never inflate counts.
        const canon = canonicalizeOrders(orderRows);
        const known = new Set(s.orders.map((o) => o.subOrderNo));
        // stamp the source file so this import can be deleted later
        const fresh = canon.orders
          .filter((o) => !known.has(o.subOrderNo))
          .map((o) => ({ ...o, sourceFile: fileName }));

        // rebuild ledger + QC queue from the full order set + existing events so
        // returns/RTO confirmed by payment always create QC-pending entries.
        const nextState: V2State = { ...s, orders: [...s.orders, ...fresh] };
        const rebuilt = rebuildOrderLedger(nextState);

        const upload: UploadRecord = {
          id: uid("up"), fileName, fileType: "ORDERS_CSV", fileHash,
          monthLabel: fresh[0]?.orderDate?.slice(0, 7) ?? "", rowCount: orderRows.length,
          matched: fresh.length, unmatched: 0, at: new Date().toISOString(),
        };
        const note: AppNotification = {
          id: uid("n"), at: new Date().toISOString(), kind: "import",
          title: `Order file imported — ${fresh.length.toLocaleString("en-IN")} orders`,
          body: canon.mergedSubOrders.length
            ? `${canon.rawRowCount} order rows → ${canon.uniqueCount} unique orders (${canon.mergedSubOrders.length} multi-line orders merged).`
            : `${canon.uniqueCount} unique orders.`,
          read: false,
        };
        setState((cur) => cur && {
          ...cur, orders: [...cur.orders, ...fresh],
          ledger: rebuilt.ledger, returnsQueue: rebuilt.returnsQueue,
          uploads: [...cur.uploads, upload],
          notifications: [...cur.notifications, note],
          audit: [...cur.audit, audit("UPLOAD", fileName, upload.id,
            `${canon.rawRowCount} rows → ${fresh.length} orders (${canon.mergedSubOrders.length} merged)`)],
        });
        return { newOrders: fresh.length, rawRows: canon.rawRowCount, uniqueOrders: canon.uniqueCount, merged: canon.mergedSubOrders.length };
      },

      qcDecision: (itemId, result, notes = "") => {
        guard("qc_decision");
        setState((cur) => {
          if (!cur) return cur;
          const item = cur.returnsQueue.find((r) => r.id === itemId);
          if (!item || item.qcStatus === "DONE") return cur;
          const ev = qcDecisionEvent(item.skuCode, item.subOrderNo, result, 1, todayIso(), notes);
          return {
            ...cur,
            ledger: [...cur.ledger, ev],
            returnsQueue: cur.returnsQueue.map((r) =>
              r.id === itemId
                ? { ...r, qcStatus: "DONE", qcResult: result, qcNotes: notes, qcBy: me.id, restocked: result === "SELLABLE", receivedDate: r.receivedDate ?? todayIso() }
                : r
            ),
            // mismatch → seed a claim draft (links to claim tracker)
            claims: result === "MISMATCH"
              ? [...cur.claims, {
                  id: uid("cl"), subOrderNo: item.subOrderNo, skuCode: item.skuCode,
                  raisedDate: todayIso(), ticketRef: "", status: "RAISED",
                  amountClaimed: cur.skus.find((s) => s.skuCode === item.skuCode)?.currentCogs ?? 0,
                  amountReceived: 0, notes: notes || "QC mismatch — raise with Meesho",
                }]
              : cur.claims,
            audit: [...cur.audit, audit(`QC_${result}`, "return", item.subOrderNo, notes)],
          };
        });
      },

      addPurchase: (p) => {
        guard("add_purchase");
        const id = uid("pur"); // hoisted so callers (PO receive) get the bill id
        setState((cur) => {
          if (!cur) return cur;
          const stock = currentStock(cur.ledger);
          const skus = [...cur.skus];
          const cogsHistory = [...cur.cogsHistory];
          const ledger = [...cur.ledger];
          for (const item of p.items) {
            ledger.push({
              skuCode: item.skuCode, eventType: "PURCHASE_IN", quantityDelta: item.quantity,
              refType: "purchase", refId: id, createdAt: p.invoiceDate || todayIso(),
            });
            const i = skus.findIndex((s) => s.skuCode === item.skuCode);
            if (i >= 0) {
              const oldCogs = skus[i].currentCogs;
              const newCogs = weightedAvgCogs(stock.get(item.skuCode) ?? 0, oldCogs, item.quantity, item.unitCost);
              if (newCogs !== oldCogs) {
                skus[i] = { ...skus[i], currentCogs: newCogs };
                cogsHistory.push({ skuCode: item.skuCode, oldCogs, newCogs, reason: "PURCHASE_AVG", at: todayIso(), by: me.name });
              }
            }
          }
          return {
            ...cur, purchases: [...cur.purchases, { ...p, id }], ledger, skus, cogsHistory,
            audit: [...cur.audit, audit("PURCHASE_ADD", "purchase", id, `${p.supplierName} ₹${p.totalAmount}`)],
          };
        });
        return id;
      },

      addPurchaseOrder: (po) => {
        guard("add_purchase");
        const cur = stateRef.current!;
        const id = uid("po");
        const rec: PurchaseOrder = {
          ...po, id,
          number: `PO-${String((cur.purchaseOrders ?? []).length + 1).padStart(4, "0")}`,
          date: po.date ?? todayIso().slice(0, 10),
          status: "open",
        };
        setState((s) => s && {
          ...s, purchaseOrders: [...(s.purchaseOrders ?? []), rec],
          audit: [...s.audit, audit("PO_ADD", "purchase_order", rec.number, `${rec.supplierName} · ${rec.items.length} lines`)],
        });
        return id;
      },

      cancelPurchaseOrder: (id) => {
        guard("add_purchase");
        setState((s) => s && {
          ...s,
          purchaseOrders: (s.purchaseOrders ?? []).map((p) => (p.id === id && p.status === "open" ? { ...p, status: "cancelled" } : p)),
          audit: [...s.audit, audit("PO_CANCEL", "purchase_order", id)],
        });
      },

      receivePurchaseOrder: (id) => {
        guard("add_purchase");
        const cur = stateRef.current!;
        const po = (cur.purchaseOrders ?? []).find((p) => p.id === id);
        if (!po) return { ok: false, message: "Purchase order not found." };
        if (po.status !== "open") return { ok: false, message: `PO is ${po.status}.` };
        // quick-create unknown SKUs so stock IN + COGS land somewhere real
        const known = new Set(cur.skus.map((s) => s.skuCode));
        for (const item of po.items) {
          if (!known.has(item.skuCode)) {
            actions.quickCreateSku({ skuCode: item.skuCode, productName: item.skuCode });
            known.add(item.skuCode);
          }
        }
        // landed cost grosses up unit costs; GST applies to goods value only
        const landed = po.landedCost ?? 0;
        const allocated = allocateLandedCost(po.items, landed, po.landedCostBasis ?? "value");
        const totals = receivedBillTotals(po.items, landed);
        const purchaseId = actions.addPurchase({
          vendorId: po.vendorId,
          supplierName: po.supplierName,
          invoiceNo: po.number,
          invoiceDate: todayIso().slice(0, 10),
          totalAmount: totals.total,
          gstAmount: totals.gst,
          paymentStatus: "pending",
          notes: [`Received from ${po.number}`, landed > 0 && `landed cost ₹${landed} (${po.landedCostBasis ?? "value"})`, po.notes]
            .filter(Boolean).join(" · "),
          items: allocated.map((a) => ({ skuCode: a.skuCode, quantity: a.quantity, unitCost: a.landedUnitCost, gstRate: a.gstRate })),
        });
        setState((s) => s && {
          ...s,
          purchaseOrders: (s.purchaseOrders ?? []).map((p) => (p.id === id ? { ...p, status: "received", purchaseId } : p)),
          audit: [...s.audit, audit("PO_RECEIVE", "purchase_order", po.number, `→ bill ${purchaseId} ₹${totals.total}`)],
        });
        return { ok: true, purchaseId };
      },

      addVendorCredit: (purchaseId, amount, reason) => {
        guard("add_purchase");
        const cur = stateRef.current!;
        const bill = cur.purchases.find((p) => p.id === purchaseId);
        if (!bill) return { ok: false, message: "Bill not found." };
        const outstanding = Math.round((bill.totalAmount - (bill.amountPaid ?? 0) - (bill.amountCredited ?? 0)) * 100) / 100;
        const applied = Math.min(Math.round(amount * 100) / 100, outstanding);
        if (applied <= 0) return { ok: false, message: "Nothing outstanding to credit." };
        const vc: VendorCredit = {
          id: uid("vc"), purchaseId,
          number: `VC-${String((cur.vendorCredits ?? []).length + 1).padStart(4, "0")}`,
          amount: applied, date: todayIso().slice(0, 10), reason: reason || undefined,
        };
        setState((s) => s && {
          ...s,
          purchases: s.purchases.map((p) => {
            if (p.id !== purchaseId) return p;
            const credited = Math.round(((p.amountCredited ?? 0) + applied) * 100) / 100;
            const settled = (p.amountPaid ?? 0) + credited;
            const paymentStatus: Purchase["paymentStatus"] = settled >= p.totalAmount - 0.005 ? "paid" : settled > 0 ? "partial" : p.paymentStatus;
            return { ...p, amountCredited: credited, paymentStatus };
          }),
          vendorCredits: [...(s.vendorCredits ?? []), vc],
          audit: [...s.audit, audit("VENDOR_CREDIT", "purchase", purchaseId, `${vc.number} ₹${applied}${reason ? ` — ${reason}` : ""}`)],
        });
        return { ok: true };
      },

      overrideCogs: (skuCode, newCogs) => {
        guard("override_cogs");
        setState((cur) => {
          if (!cur) return cur;
          const sku = cur.skus.find((s) => s.skuCode === skuCode);
          if (!sku) return cur;
          return {
            ...cur,
            skus: cur.skus.map((s) => (s.skuCode === skuCode ? { ...s, currentCogs: newCogs } : s)),
            cogsHistory: [...cur.cogsHistory, { skuCode, oldCogs: sku.currentCogs, newCogs, reason: "MANUAL", at: todayIso(), by: me.name }],
            audit: [...cur.audit, audit("COGS_OVERRIDE", "sku", skuCode, `₹${sku.currentCogs} → ₹${newCogs}`)],
          };
        });
      },

      updateSku: (skuCode, patch) => {
        guard("edit_skus");
        setState((cur) => cur && {
          ...cur,
          skus: cur.skus.map((s) => (s.skuCode === skuCode ? { ...s, ...patch } : s)),
        });
      },

      upsertProduct: (sku, originalCode) => {
        guard("edit_skus");
        setState((cur) => {
          if (!cur) return cur;
          const code = originalCode ?? sku.skuCode;
          const exists = cur.skus.some((s) => s.skuCode === code);
          const skus = exists
            ? cur.skus.map((s) => (s.skuCode === code ? sku : s))
            : [...cur.skus, sku];
          // opening stock → a one-time ADJUSTMENT ledger row (only on create)
          const ledger = [...cur.ledger];
          if (!exists && sku.openingStock && sku.openingStock > 0) {
            ledger.push({
              skuCode: sku.skuCode, eventType: "ADJUSTMENT", quantityDelta: sku.openingStock,
              refType: "manual", refId: uid("open"), notes: "Opening stock", createdAt: todayIso(),
            });
          }
          return {
            ...cur, skus, ledger,
            audit: [...cur.audit, audit(exists ? "PRODUCT_EDIT" : "PRODUCT_CREATE", "sku", sku.skuCode)],
          };
        });
      },

      addVendor: (v) => {
        guard("add_purchase");
        setState((cur) => cur && {
          ...cur,
          vendors: [...cur.vendors, { ...v, id: uid("ven"), createdAt: new Date().toISOString() }],
          audit: [...cur.audit, audit("VENDOR_ADD", "vendor", v.name)],
        });
      },

      addCustomer: (c) => {
        guard("manage_invoices");
        const id = uid("cus");
        setState((cur) => cur && {
          ...cur,
          customers: [...cur.customers, { ...c, id, createdAt: new Date().toISOString() }],
          audit: [...cur.audit, audit("CUSTOMER_ADD", "customer", c.name)],
        });
        return id;
      },

      addInvoice: (i) => {
        guard("manage_invoices");
        const id = uid("inv");
        setState((cur) => cur && {
          ...cur,
          invoices: [...cur.invoices, { ...i, id, amountPaid: 0, status: "open" }],
          audit: [...cur.audit, audit("INVOICE_ADD", "invoice", i.number || id)],
        });
        return id;
      },

      recordInvoiceReceipt: (invoiceId, amount) => {
        guard("manage_invoices");
        setState((cur) => {
          if (!cur) return cur;
          const target = cur.invoices.find((i) => i.id === invoiceId);
          if (!target) return cur;
          // clamp the receipt to the outstanding balance (net of credits)
          const outstanding = Math.round((target.amount - target.amountPaid - (target.amountCredited ?? 0)) * 100) / 100;
          const applied = Math.min(Math.round(amount * 100) / 100, outstanding);
          if (applied <= 0) return cur;
          const invoices = cur.invoices.map((inv) => {
            if (inv.id !== invoiceId) return inv;
            const paid = Math.round((inv.amountPaid + applied) * 100) / 100;
            const settled = paid + (inv.amountCredited ?? 0);
            const status: Invoice["status"] = settled >= inv.amount - 0.005 ? "paid" : settled > 0 ? "partial" : "open";
            return { ...inv, amountPaid: paid, status };
          });
          const receipt: Receipt = { id: uid("rcpt"), invoiceId, amount: applied, date: todayIso().slice(0, 10) };
          return {
            ...cur, invoices,
            receipts: [...(cur.receipts ?? []), receipt],
            audit: [...cur.audit, audit("INVOICE_RECEIPT", "invoice", invoiceId, String(applied))],
          };
        });
      },

      addCreditNote: (invoiceId, amount, reason) => {
        guard("manage_invoices");
        const cur = stateRef.current!;
        const target = cur.invoices.find((i) => i.id === invoiceId);
        if (!target) return { ok: false, message: "Invoice not found." };
        const outstanding = Math.round((target.amount - target.amountPaid - (target.amountCredited ?? 0)) * 100) / 100;
        const applied = Math.min(Math.round(amount * 100) / 100, outstanding);
        if (applied <= 0) return { ok: false, message: "Nothing outstanding to credit." };
        const cn: CreditNote = {
          id: uid("cn"), customerId: target.customerId, invoiceId,
          number: `CN-${String((cur.creditNotes ?? []).length + 1).padStart(4, "0")}`,
          amount: applied, date: todayIso().slice(0, 10), reason: reason || undefined,
          status: "applied",
        };
        setState((s) => s && {
          ...s,
          invoices: s.invoices.map((inv) => {
            if (inv.id !== invoiceId) return inv;
            const credited = Math.round(((inv.amountCredited ?? 0) + applied) * 100) / 100;
            const settled = inv.amountPaid + credited;
            const status: Invoice["status"] = settled >= inv.amount - 0.005 ? "paid" : settled > 0 ? "partial" : "open";
            return { ...inv, amountCredited: credited, status };
          }),
          creditNotes: [...(s.creditNotes ?? []), cn],
          audit: [...s.audit, audit("CREDIT_NOTE", "invoice", invoiceId, `${cn.number} ₹${applied}${reason ? ` — ${reason}` : ""}`)],
        });
        return { ok: true };
      },

      addEstimate: (e) => {
        guard("manage_invoices");
        const cur = stateRef.current!;
        const id = uid("est");
        const est: Estimate = {
          id, customerId: e.customerId,
          number: `EST-${String((cur.estimates ?? []).length + 1).padStart(4, "0")}`,
          amount: Math.round(e.amount * 100) / 100, date: e.date,
          expiryDate: e.expiryDate, notes: e.notes, status: "open",
        };
        setState((s) => s && {
          ...s, estimates: [...(s.estimates ?? []), est],
          audit: [...s.audit, audit("ESTIMATE_ADD", "estimate", est.number)],
        });
        return id;
      },

      setEstimateStatus: (id, status) => {
        guard("manage_invoices");
        setState((s) => s && {
          ...s,
          estimates: (s.estimates ?? []).map((e) =>
            e.id === id && (e.status === "open" || e.status === "accepted") ? { ...e, status } : e),
          audit: [...s.audit, audit("ESTIMATE_STATUS", "estimate", id, status)],
        });
      },

      convertEstimateToInvoice: (id) => {
        guard("manage_invoices");
        const cur = stateRef.current!;
        const est = (cur.estimates ?? []).find((e) => e.id === id);
        if (!est) return { ok: false, message: "Estimate not found." };
        if (est.status === "invoiced") return { ok: false, message: "Already converted." };
        if (est.status === "declined") return { ok: false, message: "Estimate was declined." };
        const invoiceId = uid("inv");
        const today = todayIso().slice(0, 10);
        const due = new Date(Date.now() + 15 * 86400000).toISOString().slice(0, 10);
        setState((s) => s && {
          ...s,
          invoices: [...s.invoices, {
            id: invoiceId, customerId: est.customerId,
            number: `INV-${String(s.invoices.length + 1).padStart(4, "0")}`,
            amount: est.amount, amountPaid: 0, invoiceDate: today, dueDate: due,
            status: "open", notes: est.notes ? `From ${est.number} — ${est.notes}` : `From ${est.number}`,
          }],
          estimates: (s.estimates ?? []).map((e) => (e.id === id ? { ...e, status: "invoiced", invoiceId } : e)),
          audit: [...s.audit, audit("ESTIMATE_CONVERT", "estimate", est.number, `→ invoice ${invoiceId}`)],
        });
        return { ok: true, invoiceId };
      },

      addRecurringInvoice: (r) => {
        guard("manage_invoices");
        const id = uid("rec");
        const today = todayIso().slice(0, 10);
        const day = Math.max(1, Math.min(31, Math.round(r.dayOfMonth)));
        let rec: RecurringInvoice = {
          id, customerId: r.customerId, amount: Math.round(r.amount * 100) / 100,
          cadence: "monthly", dayOfMonth: day,
          nextRunDate: firstRunDate(today, day),
          active: true, notes: r.notes,
        };
        // A schedule whose first occurrence is today bills immediately — done
        // HERE, in the same setState, so it can't race a follow-up action call
        // reading a stale stateRef.
        const { runs, nextRunDate } = computeDueRuns(rec.nextRunDate, today, day);
        if (runs.length > 0) rec = { ...rec, nextRunDate, lastRunDate: runs[runs.length - 1] };
        setState((s) => {
          if (!s) return s;
          const firstInvoices: Invoice[] = runs.map((runDate, i) => ({
            id: uid("inv"), customerId: rec.customerId,
            number: `INV-${String(s.invoices.length + i + 1).padStart(4, "0")}`,
            amount: rec.amount, amountPaid: 0, invoiceDate: runDate,
            dueDate: new Date(new Date(`${runDate}T00:00:00Z`).getTime() + 15 * 86400000).toISOString().slice(0, 10),
            status: "open", notes: rec.notes ? `Recurring — ${rec.notes}` : "Recurring",
          }));
          return {
            ...s,
            invoices: [...s.invoices, ...firstInvoices],
            recurringInvoices: [...(s.recurringInvoices ?? []), rec],
            audit: [...s.audit, audit("RECURRING_ADD", "recurring_invoice", id,
              `₹${rec.amount} monthly day ${day}${runs.length ? ` (billed ${runs.length} immediately)` : ""}`)],
          };
        });
        return id;
      },

      toggleRecurringInvoice: (id, active) => {
        guard("manage_invoices");
        setState((s) => s && {
          ...s,
          recurringInvoices: (s.recurringInvoices ?? []).map((r) => (r.id === id ? { ...r, active } : r)),
          audit: [...s.audit, audit("RECURRING_TOGGLE", "recurring_invoice", id, active ? "on" : "off")],
        });
      },

      runRecurringInvoices: () => {
        guard("manage_invoices");
        const cur = stateRef.current!;
        const today = todayIso().slice(0, 10);
        let created = 0;
        const newInvoices: Invoice[] = [];
        const updated = (cur.recurringInvoices ?? []).map((r) => {
          if (!r.active) return r;
          const { runs, nextRunDate } = computeDueRuns(r.nextRunDate, today, r.dayOfMonth);
          if (runs.length === 0) return r;
          for (const runDate of runs) {
            newInvoices.push({
              id: uid("inv"), customerId: r.customerId,
              number: `INV-${String(cur.invoices.length + newInvoices.length + 1).padStart(4, "0")}`,
              amount: r.amount, amountPaid: 0, invoiceDate: runDate,
              dueDate: new Date(new Date(`${runDate}T00:00:00Z`).getTime() + 15 * 86400000).toISOString().slice(0, 10),
              status: "open", notes: r.notes ? `Recurring — ${r.notes}` : "Recurring",
            });
            created++;
          }
          return { ...r, nextRunDate, lastRunDate: runs[runs.length - 1] };
        });
        if (created > 0) {
          setState((s) => s && {
            ...s,
            invoices: [...s.invoices, ...newInvoices],
            recurringInvoices: updated,
            notifications: [...s.notifications, {
              id: uid("n"), at: new Date().toISOString(), kind: "info" as const,
              title: `${created} recurring invoice${created === 1 ? "" : "s"} created`,
              body: "Due recurring schedules were materialized.", read: false,
            }],
            audit: [...s.audit, audit("RECURRING_RUN", "recurring_invoice", "all", `${created} invoices created`)],
          });
        }
        return { created };
      },

      runPaymentReminders: () => {
        guard("manage_invoices");
        const cur = stateRef.current!;
        const today = todayIso().slice(0, 10);
        const due = cur.invoices.filter((i) => shouldRemind(i, today));
        if (due.length === 0) return { reminded: 0 };
        const name = (id: string) => cur.customers.find((c) => c.id === id)?.name ?? "customer";
        setState((s) => s && {
          ...s,
          invoices: s.invoices.map((i) => (due.some((d) => d.id === i.id) ? { ...i, lastReminderAt: today } : i)),
          notifications: [...s.notifications, ...due.map((i) => ({
            id: uid("n"), at: new Date().toISOString(), kind: "unpaid_aging" as const,
            title: `${i.number || i.id} is ${daysOverdue(i, today)} days overdue`,
            body: `${name(i.customerId)} owes ${invoiceOutstanding(i).toLocaleString("en-IN")} — follow up.`,
            read: false,
          }))],
          audit: [...s.audit, audit("PAYMENT_REMINDERS", "invoice", "auto", `${due.length} overdue reminder(s)`)],
        });
        return { reminded: due.length };
      },

      remindInvoice: (id) => {
        guard("manage_invoices");
        const cur = stateRef.current!;
        const today = todayIso().slice(0, 10);
        const inv = cur.invoices.find((i) => i.id === id);
        if (!inv) return;
        const name = cur.customers.find((c) => c.id === inv.customerId)?.name ?? "customer";
        setState((s) => s && {
          ...s,
          invoices: s.invoices.map((i) => (i.id === id ? { ...i, lastReminderAt: today } : i)),
          notifications: [...s.notifications, {
            id: uid("n"), at: new Date().toISOString(), kind: "unpaid_aging" as const,
            title: `Reminder — ${inv.number || inv.id}`,
            body: `${name} owes ${invoiceOutstanding(inv).toLocaleString("en-IN")} (due ${inv.dueDate}).`,
            read: false,
          }],
          audit: [...s.audit, audit("PAYMENT_REMIND", "invoice", id)],
        });
      },

      updateCustomer: (id, patch) => {
        guard("manage_invoices");
        setState((cur) => cur && {
          ...cur,
          customers: cur.customers.map((c) => (c.id === id ? { ...c, ...patch, id: c.id, createdAt: c.createdAt } : c)),
          audit: [...cur.audit, audit("CUSTOMER_EDIT", "customer", id)],
        });
      },

      mergeCustomers: (keepId, mergedId) => {
        guard("manage_invoices");
        const cur = stateRef.current!;
        const r = mergeCustomerRecords(cur.customers, cur.invoices, keepId, mergedId);
        if (!r.ok) return { ok: false, message: r.message };
        setState((s) => s && {
          ...s,
          customers: r.customers,
          invoices: r.invoices,
          audit: [...s.audit, audit("CUSTOMER_MERGE", "customer", keepId, `merged ${mergedId} into ${keepId}`)],
        });
        return { ok: true };
      },

      importCustomers: (rows) => {
        guard("manage_invoices");
        const cur = stateRef.current!;
        const { fresh, skippedDuplicates } = dedupeByName(cur.customers, rows);
        if (fresh.length) {
          const now = new Date().toISOString();
          setState((s) => s && {
            ...s,
            customers: [...s.customers, ...fresh.map((r) => ({ ...r, id: uid("cus"), createdAt: now }))],
            audit: [...s.audit, audit("CUSTOMER_IMPORT", "customer", "csv", `${fresh.length} added, ${skippedDuplicates} duplicates skipped`)],
          });
        }
        return { added: fresh.length, skipped: skippedDuplicates };
      },

      updateVendor: (id, patch) => {
        guard("add_purchase");
        setState((cur) => cur && {
          ...cur,
          vendors: cur.vendors.map((v) => (v.id === id ? { ...v, ...patch, id: v.id, createdAt: v.createdAt } : v)),
          audit: [...cur.audit, audit("VENDOR_EDIT", "vendor", id)],
        });
      },

      importVendors: (rows) => {
        guard("add_purchase");
        const cur = stateRef.current!;
        const { fresh, skippedDuplicates } = dedupeByName(cur.vendors, rows);
        if (fresh.length) {
          const now = new Date().toISOString();
          setState((s) => s && {
            ...s,
            vendors: [...s.vendors, ...fresh.map((r) => ({
              name: r.name, gstin: r.gstin ?? "", address: r.address ?? "", contact: r.phone ?? "",
              state: r.state, email: r.email, notes: r.notes,
              id: uid("ven"), createdAt: now,
            }))],
            audit: [...s.audit, audit("VENDOR_IMPORT", "vendor", "csv", `${fresh.length} added, ${skippedDuplicates} duplicates skipped`)],
          });
        }
        return { added: fresh.length, skipped: skippedDuplicates };
      },

      recordBillPayment: (purchaseId, amount) => {
        guard("record_payment");
        setState((cur) => {
          if (!cur) return cur;
          const target = cur.purchases.find((p) => p.id === purchaseId);
          if (!target) return cur;
          const alreadyPaid = target.amountPaid ?? 0;
          const credited = target.amountCredited ?? 0;
          const applied = Math.min(Math.round(amount * 100) / 100, Math.round((target.totalAmount - alreadyPaid - credited) * 100) / 100);
          if (applied <= 0) return cur;
          const purchases = cur.purchases.map((p) => {
            if (p.id !== purchaseId) return p;
            const paid = Math.round((alreadyPaid + applied) * 100) / 100;
            const paymentStatus: Purchase["paymentStatus"] = paid + credited >= p.totalAmount - 0.005 ? "paid" : "partial";
            return { ...p, amountPaid: paid, paymentStatus };
          });
          const payment: BillPayment = { id: uid("bpay"), purchaseId, amount: applied, date: todayIso().slice(0, 10) };
          return {
            ...cur, purchases,
            billPayments: [...(cur.billPayments ?? []), payment],
            audit: [...cur.audit, audit("BILL_PAYMENT", "purchase", purchaseId, String(applied))],
          };
        });
      },

      addExpense: (e) => {
        guard("add_expense");
        setState((cur) => cur && {
          ...cur,
          expenses: [...cur.expenses, { ...e, id: uid("ex"), createdBy: me.id }],
          audit: [...cur.audit, audit("EXPENSE_ADD", "expense", e.description, `₹${e.amount}`)],
        });
      },

      deleteExpense: (id) => {
        guard("add_expense");
        setState((cur) => cur && {
          ...cur,
          expenses: cur.expenses.filter((e) => e.id !== id),
          audit: [...cur.audit, audit("EXPENSE_DELETE", "expense", id)],
        });
      },

      importBankTxns: (txns) => {
        guard("add_expense");
        setState((cur) => cur && {
          ...cur,
          bankTxns: [...cur.bankTxns, ...txns.map((t) => ({ ...t, id: uid("bt"), status: "PENDING" as const }))],
        });
      },

      categorizeBankTxn: (id, category) => {
        guard("add_expense");
        setState((cur) => {
          if (!cur) return cur;
          const txn = cur.bankTxns.find((t) => t.id === id);
          if (!txn) return cur;
          if (category === null) {
            return { ...cur, bankTxns: cur.bankTxns.map((t) => (t.id === id ? { ...t, status: "IGNORED" } : t)) };
          }
          const hint = hintFromCategorization(txn.description, category);
          return {
            ...cur,
            bankTxns: cur.bankTxns.map((t) => (t.id === id ? { ...t, status: "CATEGORIZED", category } : t)),
            expenses: [...cur.expenses, {
              id: uid("ex"), expenseDate: txn.txnDate, category,
              description: txn.description, amount: txn.debit, gstAmount: 0,
              paymentMode: "Bank", source: "BANK_IMPORT", sourceKey: null,
              bankRef: txn.id, createdBy: me.id,
            }],
            categoryHints: cur.categoryHints.some((h) => h.pattern === hint.pattern)
              ? cur.categoryHints
              : [...cur.categoryHints, hint],
          };
        });
      },

      addClaim: (c) => {
        guard("raise_claim");
        setState((cur) => cur && { ...cur, claims: [...cur.claims, { ...c, id: uid("cl") }] });
      },

      updateClaim: (id, patch) => {
        guard("raise_claim");
        setState((cur) => cur && {
          ...cur,
          claims: cur.claims.map((c) => (c.id === id ? { ...c, ...patch } : c)),
        });
      },

      markDisputed: (subOrderNo, disputed) => {
        guard("mark_disputed");
        setState((cur) => cur && {
          ...cur,
          disputed: disputed
            ? Array.from(new Set([...cur.disputed, subOrderNo]))
            : cur.disputed.filter((s) => s !== subOrderNo),
          audit: [...cur.audit, audit(disputed ? "MARK_DISPUTED" : "CLEAR_DISPUTED", "order", subOrderNo)],
        });
      },

      stockAdjustment: (skuCode, delta, reason) => {
        guard("stock_adjustment");
        if (!reason.trim()) throw new Error("Adjustment reason is mandatory.");
        setState((cur) => cur && {
          ...cur,
          ledger: [...cur.ledger, {
            skuCode, eventType: "ADJUSTMENT", quantityDelta: delta,
            refType: "manual", refId: uid("adj"), notes: reason, createdAt: todayIso(),
          }],
          audit: [...cur.audit, audit("STOCK_ADJUSTMENT", "sku", skuCode, `${delta > 0 ? "+" : ""}${delta}: ${reason}`)],
        });
      },

      printLabels: (items) => {
        guard("print_labels");
        setState((cur) => cur && {
          ...cur,
          ledger: [...cur.ledger, ...items.map((i) => ({
            skuCode: i.skuCode, eventType: "LABEL_PRINTED" as const, quantityDelta: 0,
            refType: "label" as const, refId: uid("lbl"), notes: `${i.count} labels`, createdAt: todayIso(),
          }))],
          audit: [...cur.audit, audit("LABELS_PRINTED", "labels", items.map((i) => `${i.skuCode}×${i.count}`).join(", "))],
        });
      },

      inviteUser: (u) => {
        guard("manage_team");
        setState((cur) => cur && {
          ...cur,
          users: [...cur.users, { ...u, id: uid("u"), active: true }],
          audit: [...cur.audit, audit("USER_INVITED", "user", u.name, u.role)],
        });
      },

      setSettleAfterDays: (days) => {
        setState((cur) => cur && { ...cur, org: { ...cur.org, settleAfterDays: days } });
      },

      mapSku: (entry) => {
        guard("edit_skus");
        setState((cur) => {
          if (!cur) return cur;
          const skuMap = [
            ...cur.skuMap.filter((m) => m.listingSku.toLowerCase() !== entry.listingSku.toLowerCase()),
            entry,
          ];
          // retroactively recompute the order-derived ledger with the new map
          const rebuilt = rebuildOrderLedger({ ...cur, skuMap });
          return {
            ...cur, skuMap, ledger: rebuilt.ledger, returnsQueue: rebuilt.returnsQueue,
            audit: [...cur.audit, audit("SKU_MAP", "sku_map", entry.listingSku,
              entry.components ? `bundle → ${entry.components.map((c) => `${c.inventorySku}×${c.qty}`).join(", ")}` : `→ ${entry.inventorySku}`)],
          };
        });
      },

      mapSkuBulk: (entries) => {
        guard("edit_skus");
        if (entries.length === 0) return;
        setState((cur) => {
          if (!cur) return cur;
          const incoming = new Set(entries.map((e) => e.listingSku.toLowerCase()));
          const skuMap = [
            ...cur.skuMap.filter((m) => !incoming.has(m.listingSku.toLowerCase())),
            ...entries,
          ];
          // one ledger rebuild for the whole batch (fast)
          const rebuilt = rebuildOrderLedger({ ...cur, skuMap });
          return {
            ...cur, skuMap, ledger: rebuilt.ledger, returnsQueue: rebuilt.returnsQueue,
            audit: [...cur.audit, audit("SKU_MAP_BULK", "sku_map", `${entries.length} auto-mapped`)],
          };
        });
      },

      unmapSku: (listingSku) => {
        guard("edit_skus");
        setState((cur) => {
          if (!cur) return cur;
          const skuMap = cur.skuMap.filter((m) => m.listingSku.toLowerCase() !== listingSku.toLowerCase());
          const rebuilt = rebuildOrderLedger({ ...cur, skuMap });
          return {
            ...cur, skuMap, ledger: rebuilt.ledger, returnsQueue: rebuilt.returnsQueue,
            audit: [...cur.audit, audit("SKU_UNMAP", "sku_map", listingSku)],
          };
        });
      },

      quickCreateSku: (sku) => {
        guard("edit_skus");
        setState((cur) => {
          if (!cur || cur.skus.some((s) => s.skuCode === sku.skuCode)) return cur;
          return {
            ...cur,
            skus: [...cur.skus, {
              skuCode: sku.skuCode, productName: sku.productName ?? sku.skuCode,
              category: sku.category ?? "", sizeSet: sku.sizeSet ?? "",
              currentCogs: sku.currentCogs ?? 0, gstRate: sku.gstRate ?? 5,
              hsnCode: sku.hsnCode ?? "", reorderLevel: sku.reorderLevel ?? 0, status: "active",
            }],
            audit: [...cur.audit, audit("SKU_CREATE", "sku", sku.skuCode)],
          };
        });
      },

      markNotificationsRead: () => {
        setState((cur) => cur && {
          ...cur, notifications: cur.notifications.map((n) => ({ ...n, read: true })),
        });
      },

      // ── Bank import staging ────────────────────────────────────────
      setStagingTxns: (txns) => {
        guard("add_expense");
        setState((cur) => cur && { ...cur, stagingTxns: txns });
      },

      updateStagingTxn: (id, patch) => {
        setState((cur) => cur && {
          ...cur,
          stagingTxns: cur.stagingTxns.map((t) => t.id === id ? { ...t, ...patch } : t),
        });
      },

      clearStaging: () => {
        setState((cur) => cur && { ...cur, stagingTxns: [] });
      },

      confirmBankImport: (txns) => {
        guard("add_expense");
        setState((cur) => {
          if (!cur) return cur;
          const toPost = txns.filter((t) => t.status !== "IGNORED" && t.status !== "DUPLICATE");
          const newBankTxns: StoredBankTxn[] = toPost.map((t) => ({
            id: uid("bt"),
            txnDate: t.txnDate,
            description: t.description,
            debit: t.debit,
            credit: t.credit,
            status: "CATEGORIZED" as const,
            category: t.category ?? undefined,
            coaCode: t.coaCode ?? undefined,
            bankTxnId: t.bankTxnId,
            sourceFile: t.sourceFile,
          }));
          return {
            ...cur,
            stagingTxns: [],
            bankTxns: [...cur.bankTxns, ...newBankTxns],
            audit: [...cur.audit, audit(
              "BANK_IMPORT_CONFIRMED", "bank",
              `${toPost.length} txns from ${txns[0]?.sourceFile ?? "statement"}`,
            )],
          };
        });
      },

      saveBankMapping: (m) => {
        setState((cur) => {
          if (!cur) return cur;
          const rest = cur.bankMappings.filter((bm) => bm.headerHash !== m.headerHash);
          return { ...cur, bankMappings: [...rest, m] };
        });
      },

      addCategorizationRule: (r) => {
        guard("add_expense");
        setState((cur) => cur && {
          ...cur,
          categorizationRules: [
            ...cur.categorizationRules,
            { ...r, id: uid("cr"), createdAt: todayIso(), timesMatched: 0 },
          ],
        });
      },

      updateCategorizationRule: (id, patch) => {
        guard("add_expense");
        setState((cur) => cur && {
          ...cur,
          categorizationRules: cur.categorizationRules.map((r) => r.id === id ? { ...r, ...patch } : r),
        });
      },

      deleteCategorizationRule: (id) => {
        guard("add_expense");
        setState((cur) => cur && {
          ...cur,
          categorizationRules: cur.categorizationRules.filter((r) => r.id !== id),
        });
      },

      // ── Bank accounts (§2.1) ─────────────────────────────────────────
      addBankAccount: (a) => {
        guard("add_expense");
        setState((cur) => cur && {
          ...cur,
          bankAccounts: [...cur.bankAccounts, { ...a, id: uid("ba"), createdAt: todayIso() }],
          audit: [...cur.audit, audit("BANK_ACCOUNT_ADD", "bank_account", a.name)],
        });
      },

      updateBankAccount: (id, patch) => {
        guard("add_expense");
        setState((cur) => cur && {
          ...cur,
          bankAccounts: cur.bankAccounts.map((b) => (b.id === id ? { ...b, ...patch } : b)),
          audit: [...cur.audit, audit("BANK_ACCOUNT_UPDATE", "bank_account", id)],
        });
      },

      archiveBankAccount: (id) => {
        guard("add_expense");
        // Soft-delete: keep the account + its transactions for audit (§6).
        setState((cur) => cur && {
          ...cur,
          bankAccounts: cur.bankAccounts.map((b) => (b.id === id ? { ...b, archived: true } : b)),
          audit: [...cur.audit, audit("BANK_ACCOUNT_ARCHIVE", "bank_account", id)],
        });
      },
    };

    return { state, me, actions };
  }, [state]);

  if (!value) {
    return (
      <div className="mx-auto max-w-6xl space-y-4 px-4 py-10">
        <div className="skeleton h-10 w-48" />
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {[...Array(4)].map((_, i) => <div key={i} className="skeleton h-28" />)}
        </div>
        <div className="skeleton h-80" />
      </div>
    );
  }
  return <Ctx.Provider value={{ ...value, persistError, cloudStatus }}>{children}</Ctx.Provider>;
}
