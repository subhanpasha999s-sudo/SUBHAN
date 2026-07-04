"use client";
/**
 * Integrations (V3 §1) — reframes upload as a guided "connection".
 * Three ingestion methods, one pipeline: email-in auto-import (hero),
 * one-click upload with setup guide, and scheduled reminders.
 * The official Meesho API is unavailable, so this is smart file ingestion
 * that feels like a real integration.
 */
import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  Bell, Check, CheckCircle2, Copy, FileSpreadsheet, FileText, Loader2,
  Mail, RefreshCw, Trash2, Upload,
} from "lucide-react";
import { useV2 } from "@/book/lib/v2/store";
import { Guard, PageHeader, fmtDate } from "@/book/components/v2/common";
import { Badge, Button, Card, cn } from "@/book/components/ui";
import { decodeMeeshoFile } from "@/book/lib/files";
import { deriveMonthLabel } from "@/book/lib/monthLabel";
import { formatINR } from "@/book/lib/engine";
import { PaymentImportResult } from "@/book/lib/v2/store";
import { flags } from "@/book/lib/flags";
import { MARKETPLACE_PACKS } from "@/book/lib/core/marketplacePack";

async function hashFile(f: File): Promise<string> {
  const buf = await f.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export default function IntegrationsPage() {
  const { state, actions } = useV2();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [lastChange, setLastChange] = useState<
    | { kind: "orders"; newOrders: number; rawRows: number; uniqueOrders: number; merged: number }
    | { kind: "payments"; result: PaymentImportResult }
    | null
  >(null);
  const [copied, setCopied] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [warn, setWarn] = useState("");

  const lastUpload = state.uploads[state.uploads.length - 1];

  // payment-cycle detection: median day-of-month across payment uploads
  const cycle = useMemo(() => {
    const days = state.uploads
      .filter((u) => u.fileType === "PAYMENTS_XLSX")
      .map((u) => new Date(u.at).getDate())
      .filter((d) => !Number.isNaN(d));
    if (days.length === 0) return null;
    days.sort((a, b) => a - b);
    return days[Math.floor(days.length / 2)];
  }, [state.uploads]);

  const status: { label: string; tone: "success" | "warning" } = lastUpload
    ? { label: "Connected", tone: "success" }
    : { label: "Needs first file", tone: "warning" };

  async function handleFile(f: File) {
    setBusy(true); setError(""); setLastChange(null); setWarn("");
    try {
      const fileHash = await hashFile(f);
      // Detect by CONTENT, not extension — an order file saved as XLSX must not
      // be misrouted to the payment parser (which would import zero orders).
      const decoded = await decodeMeeshoFile(f);
      if (decoded.kind === "orders") {
        const res = actions.ingestOrderFile({ fileName: f.name, fileHash, orderRows: decoded.orderRows });
        if ("error" in res) setError(res.error);
        else setLastChange({ kind: "orders", ...res });
      } else {
        const { paymentRows, adsRows } = decoded.payment;
        const monthBucket = deriveMonthLabel([], paymentRows);
        const res = actions.ingestPaymentFile({ fileName: f.name, fileHash, monthBucket, paymentRows, adsRows });
        if ("error" in res) setError(res.error);
        else setLastChange({ kind: "payments", result: res });
      }
      // Post-import validation: rows that had a Sub Order No but a malformed
      // required value were dropped — surface this so loss is never silent.
      if (decoded.report.skippedBadValue > 0) {
        setWarn(`${decoded.report.skippedBadValue} row(s) had a Sub Order No but an unreadable amount and were skipped. Check the file — no other rows were lost.`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't read this file.");
    } finally {
      setBusy(false);
    }
  }

  function copyInbox() {
    navigator.clipboard?.writeText(state.inboundAddress).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <Guard section="integrations">
      <PageHeader title="Upload data" sub="Connect Meesho by forwarding or dropping your reports — we detect the file type and month automatically." />

      {flags.marketplacePacks && <MarketplacesCard />}

      {/* Connection status card */}
      <Card className="mb-6 flex flex-wrap items-center gap-4 p-5">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <span className="text-xl font-bold">M</span>
        </div>
        <div>
          <div className="flex items-center gap-2">
            <span className="font-semibold">Meesho</span>
            <Badge tone={status.tone}>{status.label}</Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            {lastUpload ? `Last sync ${fmtDate(lastUpload.at)} · ${lastUpload.fileName}` : "No files imported yet"}
          </p>
        </div>
        {cycle && (
          <div className="ml-auto flex items-center gap-2 rounded-xl bg-muted px-3 py-2 text-sm">
            <Bell className="h-4 w-4 text-primary" />
            <span>Your payment file is usually ready around the <strong>{cycle}{cycle === 1 ? "st" : cycle === 2 ? "nd" : cycle === 3 ? "rd" : "th"}</strong></span>
          </div>
        )}
      </Card>

      {/* Method 1 — Email-in (hero) */}
      <Card className="mb-6 overflow-hidden">
        <div className="border-b border-border bg-gradient-to-r from-primary/10 to-transparent px-5 py-4">
          <div className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-primary" />
            <h3 className="font-semibold">Email-in auto-import</h3>
            <Badge tone="info">recommended</Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Forward the Meesho report email to your private address. We grab the attachment,
            detect type &amp; month, reconcile, and notify you — no clicks.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 px-5 py-4">
          <code className="flex-1 rounded-xl border border-border bg-muted px-3 py-2 font-mono text-sm">
            {state.inboundAddress}
          </code>
          <Button variant="secondary" onClick={copyInbox}>
            {copied ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
            {copied ? "Copied" : "Copy"}
          </Button>
        </div>
        <p className="px-5 pb-4 text-xs text-muted-foreground">
          {/* Backend: a mail-inbound webhook (Postmark/SendGrid inbound parse) posts the
              attachment to the same parser + reconciliation pipeline used here. Dedup on file hash. */}
          Demo mode: paste a file below to simulate what arrives by email.
        </p>
      </Card>

      {/* Method 2 — One-click upload with setup guide */}
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-2">
          <h3 className="mb-3 font-semibold">One-click upload</h3>
          <label
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files?.[0]; if (f) handleFile(f); }}
            className={cn(
              "flex min-h-[180px] cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed p-6 text-center transition-colors",
              dragOver ? "border-primary bg-primary/5" : "border-border hover:border-primary"
            )}
          >
            {busy ? <Loader2 className="h-9 w-9 animate-spin text-primary" /> : <Upload className="h-9 w-9 text-muted-foreground" />}
            <p className="font-medium">Drop your Meesho file here</p>
            <p className="text-sm text-muted-foreground">Order CSV or Payment XLSX — we detect which automatically</p>
            <input type="file" accept=".csv,.xlsx,.xls" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }} />
          </label>
          {error && <p className="mt-3 text-sm text-danger">{error}</p>}
          {warn && <p className="mt-3 rounded-lg bg-warning/10 px-3 py-2 text-sm text-warning">⚠️ {warn}</p>}

          {lastChange && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mt-4">
              {lastChange.kind === "orders" ? (
                <div className="rounded-xl bg-muted p-4">
                  <div className="flex items-center gap-2 text-sm">
                    <CheckCircle2 className="h-5 w-5 text-success" />
                    <span><strong>{lastChange.newOrders.toLocaleString("en-IN")}</strong> orders imported.</span>
                  </div>
                  {lastChange.merged > 0 && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      {lastChange.rawRows.toLocaleString("en-IN")} order rows → <strong>{lastChange.uniqueOrders.toLocaleString("en-IN")} unique orders</strong> ({lastChange.merged} multi-line orders merged — exchange / cancelled-line). No rows were dropped.
                    </p>
                  )}
                </div>
              ) : (
                <div className="rounded-xl bg-muted p-4">
                  <p className="mb-3 text-sm font-medium">What changed</p>
                  <div className="grid grid-cols-2 gap-3 text-center sm:grid-cols-3 lg:grid-cols-6">
                    {([
                      ["Payment rows read", lastChange.result.rowsRead.toLocaleString("en-IN"), "rows in this file with a Sub Order No"],
                      ["Matched to an order", lastChange.result.matchedRows.toLocaleString("en-IN"), "rows whose Sub Order No exists in your order file"],
                      ["No matching order", lastChange.result.unmatchedRows.toLocaleString("en-IN"), "payouts for orders not in your order file (e.g. Feb/April)"],
                      ["Orders updated", lastChange.result.summary.ordersUpdated.toLocaleString("en-IN"), "distinct orders that gained or changed a payment event"],
                      ["Reclassified", String(lastChange.result.summary.reclassified.length), "orders whose class changed vs before this import"],
                      ["Settlement ₹", formatINR(lastChange.result.fileReceived, true), "Σ Final Settlement Amount in this file"],
                    ] as [string, string, string][]).map(([label, val, tip]) => (
                      <div key={label} title={tip} className="cursor-help">
                        <p className="text-lg font-bold tabular-nums">{val}</p>
                        <p className="text-xs text-muted-foreground">{label}</p>
                      </div>
                    ))}
                  </div>
                  {lastChange.result.duplicatesSkipped > 0 && (
                    <p className="mt-2 text-xs text-muted-foreground">{lastChange.result.duplicatesSkipped} duplicate event(s) skipped — same Transaction ID (idempotent re-upload).</p>
                  )}
                </div>
              )}
            </motion.div>
          )}
        </Card>

        {/* Setup guide */}
        <Card className="p-5">
          <h3 className="mb-3 flex items-center gap-2 font-semibold"><FileText className="h-4 w-4" /> Where to find your files</h3>
          <ol className="space-y-3 text-sm">
            {[
              ["Order CSV", "supplier.meesho.com → Orders → Download → choose the month → CSV"],
              ["Payment XLSX", "Payments → Payment Overview → Download report → XLSX (multi-sheet)"],
              ["Forward or drop", "Email it to your inbox address, or drag it into the box on the left"],
            ].map(([title, body], i) => (
              <li key={title} className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">{i + 1}</span>
                <span><strong>{title}</strong> — <span className="text-muted-foreground">{body}</span></span>
              </li>
            ))}
          </ol>
          <div className="mt-4 flex items-center gap-2 rounded-xl bg-muted p-3 text-xs text-muted-foreground">
            <FileSpreadsheet className="h-4 w-4 shrink-0" />
            Re-uploading the same file is always safe — duplicates are skipped by content hash.
          </div>
        </Card>
      </div>

      {/* Recent imports */}
      <Card className="mt-6 overflow-hidden">
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <RefreshCw className="h-4 w-4 text-muted-foreground" />
          <span className="font-semibold">Import history</span>
          {state.uploads.length > 0 && (
            <button
              onClick={() => {
                if (confirm("Delete ALL imported order & payment data? Your products, vendors, purchases and settings are kept.")) {
                  actions.clearImportedData();
                  setLastChange(null);
                }
              }}
              className="ml-auto inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium text-danger hover:bg-danger/10"
            >
              <Trash2 className="h-3.5 w-3.5" /> Clear all imported data
            </button>
          )}
        </div>
        <div className="divide-y divide-border text-sm">
          {[...state.uploads].reverse().map((u) => (
            <div key={u.id} className="flex flex-wrap items-center gap-2 px-4 py-2.5">
              {u.fileType === "ORDERS_CSV" ? <FileText className="h-4 w-4 text-muted-foreground" /> : <FileSpreadsheet className="h-4 w-4 text-muted-foreground" />}
              <span className="font-medium">{u.fileName}</span>
              <Badge>{u.monthLabel || u.fileType}</Badge>
              <span className="ml-auto text-xs text-muted-foreground">{u.rowCount} rows · {fmtDate(u.at)}</span>
              <button
                title={u.fileType === "ORDERS_CSV" ? "Delete this file and its orders" : "Delete this file and its settlement events"}
                onClick={() => {
                  if (confirm(`Delete "${u.fileName}" and the ${u.fileType === "ORDERS_CSV" ? "orders" : "settlement events"} it imported?`)) {
                    actions.deleteUpload(u.id);
                    setLastChange(null);
                  }
                }}
                className="rounded-lg p-1.5 text-muted-foreground hover:bg-danger/10 hover:text-danger"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
          {state.uploads.length === 0 && <p className="px-4 py-8 text-center text-muted-foreground">No imports yet.</p>}
        </div>
      </Card>
    </Guard>
  );
}

/** Marketplace pack framework (§7.6) — Meesho live; Flipkart/Amazon planned. */
function MarketplacesCard() {
  return (
    <Card className="mb-6 overflow-hidden">
      <div className="border-b border-border px-4 py-3">
        <span className="font-semibold">Marketplaces</span>
        <span className="ml-2 text-xs text-muted-foreground">Meesho is live · more channels plug in via the same reconciliation pipeline</span>
      </div>
      <div className="grid gap-px bg-border sm:grid-cols-2 lg:grid-cols-3">
        {MARKETPLACE_PACKS.map((p) => (
          <div key={p.id} className={cn("bg-card p-4", p.status === "planned" && "opacity-70")}>
            <div className="flex items-center gap-2">
              <span className="font-medium">{p.label}</span>
              <Badge tone={p.status === "live" ? "success" : "default"}>{p.status === "live" ? "Live" : "Planned"}</Badge>
            </div>
            <ul className="mt-2 space-y-0.5 text-xs text-muted-foreground">
              {p.fileFormats.map((f) => <li key={f}>· {f}</li>)}
            </ul>
            <div className="mt-2 flex flex-wrap gap-1">
              {p.deductionTaxonomy.slice(0, 6).map((d) => (
                <span key={d.code} className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">{d.label}</span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
