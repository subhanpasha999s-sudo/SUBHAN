"use client";
/**
 * Bank Statement Import — Phase 1–4.
 * Step flow: upload → [mapping (CSV only)] → review → confirmed
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertCircle, ArrowRight, Bot, Check, CheckCheck, ChevronDown, Download,
  FileSpreadsheet, FileUp, Filter, Landmark, Plus, Save, Trash2, Upload, X,
} from "lucide-react";
import { cn } from "@/book/components/ui";
import { useV2 } from "@/book/lib/v2/store";
import {
  AnimatedNumber, AnimatePresence, ConfettiBurst, DrawCheck, EASE_CINEMATIC,
  fadeUp, motion, ScanSweep, SPRING_POP, SPRING_SOFT,
  stagger, StepTransition,
} from "@/book/components/v2/motion";
import {
  BankColumnMapping, detectDelimiter, detectDuplicates, getCsvPreview,
  mapCsvToBankTxns, parseCamtContent, parseOfxContent, parseQifContent, ParsedBankTxn,
} from "@/book/lib/engine/bankParse";
import type { BankFormat, ParseReport, TabularFormat } from "@/book/lib/engine/bankParse";
import { buildSample, SAMPLE_FORMATS } from "@/book/lib/engine/bankSamples";
import { BankAccounts } from "./BankAccounts";
import {
  applyCategoryRules, COA_OPTIONS, STARTER_RULES,
} from "@/book/lib/engine/bankCategorize";
import type { CategorizationRule, StagedBankTxn, StagedTxnStatus } from "@/book/lib/v2/types";

const fmt = (n: number) =>
  new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

type WizardStep = "upload" | "mapping" | "review" | "confirmed";

const STATUS_META: Record<StagedTxnStatus, { label: string; color: string }> = {
  PENDING:      { label: "Pending",      color: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300" },
  RULE_MATCH:   { label: "Rule match",   color: "bg-green-100  text-green-800  dark:bg-green-900/40  dark:text-green-300"  },
  AI_SUGGESTED: { label: "AI suggested", color: "bg-blue-100   text-blue-800   dark:bg-blue-900/40   dark:text-blue-300"   },
  CONFIRMED:    { label: "Confirmed",    color: "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300" },
  DUPLICATE:    { label: "Duplicate",    color: "bg-zinc-100   text-zinc-500   dark:bg-zinc-800      dark:text-zinc-400"   },
  IGNORED:      { label: "Ignored",      color: "bg-zinc-100   text-zinc-400   dark:bg-zinc-800      dark:text-zinc-500"   },
};

// ── Utility ────────────────────────────────────────────────────────────

function headerHash(headers: string[]): string {
  return headers.map(h => h.toLowerCase().trim()).join("|");
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

const ACCEPTED_EXT = ["csv", "tsv", "xls", "xlsx", "ofx", "qfx", "qif", "xml"];

async function runAiCategorize(
  txns: StagedBankTxn[]
): Promise<Array<{ id: string; category: string; coaCode: string; confidence: number }>> {
  const resp = await fetch("/api/categorize", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      transactions: txns.map(t => ({
        id: t.id, description: t.description, debit: t.debit, credit: t.credit,
      })),
    }),
  });
  if (!resp.ok) return [];
  const data = await resp.json();
  return data.results ?? [];
}

// ── Sub-components ─────────────────────────────────────────────────────

function Badge({ status }: { status: StagedTxnStatus }) {
  const m = STATUS_META[status];
  return (
    <AnimatePresence mode="wait">
      <motion.span
        key={status}
        layout
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.6, opacity: 0 }}
        transition={SPRING_POP}
        className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", m.color)}
      >
        {m.label}
      </motion.span>
    </AnimatePresence>
  );
}

function CategorySelect({
  coaCode, onChange,
}: {
  value: string | null;
  coaCode: string | null;
  onChange: (label: string, code: string) => void;
}) {
  return (
    <select
      value={coaCode ?? ""}
      onChange={e => {
        const opt = COA_OPTIONS.find(o => o.code === e.target.value);
        if (opt) onChange(opt.label, opt.code);
      }}
      className="w-full rounded border border-[var(--border)] bg-[var(--card)] px-2 py-1 text-xs"
    >
      <option value="">— Uncategorized —</option>
      <optgroup label="Expenses (money out)">
        {COA_OPTIONS.filter(o => o.direction === "debit").map(o => (
          <option key={o.code} value={o.code}>{o.label}</option>
        ))}
      </optgroup>
      <optgroup label="Income (money in)">
        {COA_OPTIONS.filter(o => o.direction === "credit").map(o => (
          <option key={o.code} value={o.code}>{o.label}</option>
        ))}
      </optgroup>
    </select>
  );
}

// ── Step 1: Upload ─────────────────────────────────────────────────────

function UploadStep({ onFile, onPaste }: { onFile: (file: File) => void; onPaste: (text: string) => void }) {
  const [dragging, setDragging] = useState(false);
  const [mode, setMode] = useState<"upload" | "paste">("upload");
  const [pasteText, setPasteText] = useState("");
  const [sampleOpen, setSampleOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const accept = (file: File) => {
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    if (!ACCEPTED_EXT.includes(ext)) {
      alert("Unsupported file. Use CSV, TSV, XLS/XLSX, OFX, QFX, QIF, or CAMT XML.");
      return;
    }
    onFile(file);
  };

  return (
    <motion.div variants={stagger} initial="hidden" animate="show" className="mx-auto max-w-2xl space-y-6">
      <motion.div variants={fadeUp} className="text-center">
        <motion.div
          className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-[var(--primary)] to-[#a855f7] shadow-lg shadow-[var(--primary)]/30"
          animate={{ y: [0, -8, 0], rotate: [0, -3, 3, 0] }}
          transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
        >
          <Landmark className="h-10 w-10 text-white" />
        </motion.div>
        <h1 className="bg-gradient-to-r from-[var(--foreground)] to-[var(--muted-foreground)] bg-clip-text text-3xl font-bold text-transparent">
          Bank Statement Import
        </h1>
        <p className="mx-auto mt-2 max-w-md text-sm text-[var(--muted-foreground)]">
          Upload or paste your statement — CSV, TSV, Excel, OFX, QFX, QIF, or CAMT.
          We&apos;ll categorize transactions automatically and let you review before anything posts.
        </p>
      </motion.div>

      {/* Upload / Paste mode toggle */}
      <motion.div variants={fadeUp} className="mx-auto flex w-fit rounded-xl border border-[var(--border)] bg-[var(--muted)]/40 p-1 text-sm">
        {(["upload", "paste"] as const).map(m => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={cn(
              "relative rounded-lg px-4 py-1.5 font-medium transition-colors",
              mode === m ? "text-white" : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
            )}
          >
            {mode === m && (
              <motion.span layoutId="uploadModePill" className="absolute inset-0 -z-10 rounded-lg bg-[var(--primary)]" transition={SPRING_SOFT} />
            )}
            {m === "upload" ? "Upload file" : "Paste data"}
          </button>
        ))}
      </motion.div>

      {mode === "upload" ? (
        <motion.div
          variants={fadeUp}
          whileHover={{ scale: 1.01 }}
          whileTap={{ scale: 0.99 }}
          animate={dragging ? { scale: 1.03 } : { scale: 1 }}
          transition={SPRING_SOFT}
          className={cn(
            "group relative flex flex-col items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed p-14 text-center cursor-pointer",
            dragging
              ? "border-[var(--primary)] bg-[var(--primary)]/10"
              : "border-[var(--border)] hover:border-[var(--primary)]/60"
          )}
          onDragOver={e => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={e => {
            e.preventDefault(); setDragging(false);
            const f = e.dataTransfer.files[0];
            if (f) accept(f);
          }}
          onClick={() => inputRef.current?.click()}
        >
          {/* sweeping shimmer on hover / drag */}
          <motion.div
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-0 group-hover:opacity-100"
            style={{ background: "linear-gradient(110deg, transparent 30%, var(--primary), transparent 70%)", opacity: dragging ? 0.18 : undefined }}
            animate={{ x: ["-120%", "120%"] }}
            transition={{ duration: 1.8, repeat: Infinity, ease: "linear" }}
          />
          <motion.div
            animate={dragging ? { y: [-2, -10, -2], scale: 1.1 } : { y: [0, -6, 0] }}
            transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
            className="relative mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-[var(--primary)]/10"
          >
            <FileUp className="h-7 w-7 text-[var(--primary)]" />
          </motion.div>
          <p className="relative font-semibold">{dragging ? "Drop it!" : "Drop your file here, or click to browse"}</p>
          <p className="relative mt-1 text-xs text-[var(--muted-foreground)]">
            Supported: CSV, TSV, Excel (XLS/XLSX), OFX, QFX, QIF, CAMT.053/054 XML
          </p>
          <input
            ref={inputRef}
            type="file"
            accept=".csv,.tsv,.xls,.xlsx,.ofx,.qfx,.qif,.xml"
            className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) accept(f); }}
          />
        </motion.div>
      ) : (
        <motion.div variants={fadeUp} className="space-y-3">
          <textarea
            value={pasteText}
            onChange={e => setPasteText(e.target.value)}
            rows={8}
            placeholder={'Paste rows copied from your statement (CSV or tab-separated). Include the header row, e.g.:\nDate,Withdrawals,Deposits,Description\n2026-05-03,3540,0,Delhivery courier charges'}
            className="w-full rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 font-mono text-xs leading-relaxed outline-none focus:border-[var(--primary)]"
          />
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-[var(--muted-foreground)]">Tip: copy straight from Excel/Google Sheets — tabs are detected automatically.</p>
            <motion.button
              disabled={!pasteText.trim()}
              whileHover={pasteText.trim() ? { scale: 1.04 } : undefined}
              whileTap={pasteText.trim() ? { scale: 0.96 } : undefined}
              onClick={() => onPaste(pasteText)}
              className="flex shrink-0 items-center gap-1.5 rounded-xl bg-gradient-to-r from-[var(--primary)] to-[#a855f7] px-4 py-2 text-sm font-medium text-white shadow-lg shadow-[var(--primary)]/25 disabled:opacity-40 disabled:shadow-none"
            >
              <ArrowRight className="h-4 w-4" /> Continue
            </motion.button>
          </div>
        </motion.div>
      )}

      {/* Sample files — every supported format, generated on the fly */}
      <motion.div
        variants={fadeUp}
        className="relative flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--primary)]/25 bg-[var(--primary)]/5 px-4 py-3"
      >
        <div className="flex items-center gap-2 text-sm">
          <FileSpreadsheet className="h-4 w-4 text-[var(--primary)]" />
          <span>New here? Download a <strong>sample statement</strong> in any format to see what imports cleanly.</span>
        </div>
        <div className="relative shrink-0">
          <motion.button
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.96 }}
            onClick={() => setSampleOpen(o => !o)}
            className="flex items-center gap-1.5 rounded-lg border border-[var(--primary)]/40 bg-[var(--card)] px-3 py-1.5 text-xs font-medium text-[var(--primary)]"
          >
            <Download className="h-3.5 w-3.5" /> Download sample
            <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", sampleOpen && "rotate-180")} />
          </motion.button>
          <AnimatePresence>
            {sampleOpen && (
              <motion.div
                initial={{ opacity: 0, y: -6, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -6, scale: 0.96 }}
                transition={SPRING_SOFT}
                className="absolute right-0 z-20 mt-1.5 w-48 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)] p-1 shadow-xl"
              >
                {SAMPLE_FORMATS.map(s => (
                  <button
                    key={s.format}
                    onClick={() => { const f = buildSample(s.format); triggerDownload(f.blob, f.filename); setSampleOpen(false); }}
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-left text-xs hover:bg-[var(--muted)]"
                  >
                    <FileSpreadsheet className="h-3.5 w-3.5 text-[var(--muted-foreground)]" />
                    sample_bankstatement.<span className="font-medium">{s.ext}</span>
                    <span className="ml-auto text-[10px] text-[var(--muted-foreground)]">{s.label}</span>
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>

      <motion.div variants={fadeUp} className="rounded-xl border border-[var(--border)] bg-[var(--card)]/60 p-4 backdrop-blur">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
          Where to get your file
        </p>
        <ul className="space-y-1 text-sm text-[var(--muted-foreground)]">
          <li>• <strong className="text-[var(--foreground)]">SBI / HDFC / ICICI / Axis</strong> — Net banking → Statements → Download → OFX or CSV</li>
          <li>• <strong className="text-[var(--foreground)]">Kotak / Yes Bank</strong> — Mobile app → More → Download Statement → OFX</li>
          <li>• <strong className="text-[var(--foreground)]">Any bank</strong> — Export as CSV/Excel; we&apos;ll help you map the columns</li>
        </ul>
        <p className="mt-3 border-t border-[var(--border)] pt-3 text-xs text-[var(--muted-foreground)]">
          <strong className="text-[var(--foreground)]">Expected columns:</strong> Date, Withdrawals (debit),
          Deposits (credit), Description. Extra columns like Payee or Reference Number are fine —
          we auto-detect the right ones and let you remap on the next step.
        </p>
      </motion.div>
    </motion.div>
  );
}

// ── Step 2: CSV Column Mapping ─────────────────────────────────────────

function MappingStep({
  fileName, headers, rows, initial, savedName,
  onConfirm, onBack,
}: {
  fileName: string;
  headers: string[];
  rows: string[][];
  initial: BankColumnMapping | null;
  savedName?: string;
  onConfirm: (mapping: BankColumnMapping, bankName: string, save: boolean) => void;
  onBack: () => void;
}) {
  const [mapping, setMapping] = useState<BankColumnMapping>(
    initial ?? { date: -1, description: -1, debit: -1, credit: -1 }
  );
  const [bankName, setBankName] = useState(savedName ?? "");
  const [saveMapping, setSaveMapping] = useState(!savedName);
  const [singleAmt, setSingleAmt] = useState(
    initial ? initial.debit === initial.credit : false
  );

  const valid = mapping.date >= 0 && mapping.description >= 0 &&
    (singleAmt ? mapping.debit >= 0 : mapping.debit >= 0 && mapping.credit >= 0);

  const colSelect = (label: string, field: keyof BankColumnMapping, exclude?: number[]) => (
    <div className="space-y-1">
      <label className="block text-xs font-medium text-[var(--muted-foreground)]">{label}</label>
      <select
        value={mapping[field]}
        onChange={e => setMapping(m => ({ ...m, [field]: +e.target.value }))}
        className="w-full rounded border border-[var(--border)] bg-[var(--card)] px-2 py-1.5 text-sm"
      >
        <option value={-1}>— select column —</option>
        {headers.map((h, i) => (
          <option key={i} value={i} disabled={exclude?.includes(i)}>{i + 1}: {h || `(col ${i + 1})`}</option>
        ))}
      </select>
    </div>
  );

  return (
    <motion.div variants={stagger} initial="hidden" animate="show" className="mx-auto max-w-3xl space-y-6">
      <motion.div variants={fadeUp}>
        <motion.button
          onClick={onBack}
          whileHover={{ x: -4 }}
          className="mb-3 flex items-center gap-1 text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
        >
          ← Back
        </motion.button>
        <h2 className="text-xl font-bold">Map CSV Columns</h2>
        <p className="text-sm text-[var(--muted-foreground)]">
          Tell us which column in <strong>{fileName}</strong> contains each field.
          {initial && " We detected a mapping — verify it's correct."}
        </p>
      </motion.div>

      {/* Column mapping grid */}
      <motion.div variants={fadeUp} className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 space-y-4">
        <div className="grid grid-cols-2 gap-3">
          {colSelect("Date column", "date")}
          {colSelect("Description column", "description")}
        </div>

        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={singleAmt}
            onChange={e => {
              setSingleAmt(e.target.checked);
              if (e.target.checked && mapping.debit >= 0)
                setMapping(m => ({ ...m, credit: m.debit }));
            }}
            className="rounded"
          />
          <span>Single amount column (negative = debit, positive = credit)</span>
        </label>

        {singleAmt ? (
          colSelect("Amount column", "debit")
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {colSelect("Debit (money out) column", "debit", [mapping.credit])}
            {colSelect("Credit (money in) column", "credit", [mapping.debit])}
          </div>
        )}
      </motion.div>

      {/* Preview table */}
      <motion.div variants={fadeUp} className="rounded-xl border border-[var(--border)] overflow-hidden">
        <div className="bg-[var(--muted)] px-3 py-2 text-xs font-semibold text-[var(--muted-foreground)]">
          PREVIEW (first 5 rows)
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-[var(--border)]">
                {headers.map((h, i) => {
                  const mapped = [mapping.date, mapping.description, mapping.debit, mapping.credit].includes(i);
                  return (
                    <motion.th
                      key={i}
                      animate={mapped
                        ? { backgroundColor: "rgba(124,58,237,0.12)", color: "var(--primary)" }
                        : { backgroundColor: "rgba(124,58,237,0)", color: "var(--muted-foreground)" }}
                      transition={{ duration: 0.4, ease: EASE_CINEMATIC }}
                      className="px-3 py-2 text-left font-medium"
                    >
                      {h || `Col ${i + 1}`}
                    </motion.th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, ri) => (
                <motion.tr
                  key={ri}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.15 + ri * 0.07, duration: 0.4, ease: EASE_CINEMATIC }}
                  className="border-b border-[var(--border)] last:border-0"
                >
                  {row.map((cell, ci) => (
                    <td key={ci} className={cn(
                      "px-3 py-1.5 transition-colors",
                      [mapping.date, mapping.description, mapping.debit, mapping.credit].includes(ci)
                        ? "text-[var(--foreground)] font-medium"
                        : "text-[var(--muted-foreground)]"
                    )}>
                      {cell}
                    </td>
                  ))}
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
      </motion.div>

      {/* Save mapping */}
      <motion.div variants={fadeUp} className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 space-y-3">
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input type="checkbox" checked={saveMapping} onChange={e => setSaveMapping(e.target.checked)} className="rounded" />
          <span>Remember this column layout for future imports from the same bank</span>
        </label>
        {saveMapping && (
          <input
            type="text"
            placeholder="Bank name (e.g. SBI Savings, HDFC Current)"
            value={bankName}
            onChange={e => setBankName(e.target.value)}
            className="w-full rounded border border-[var(--border)] bg-[var(--background)] px-3 py-1.5 text-sm"
          />
        )}
      </motion.div>

      <motion.button
        variants={fadeUp}
        disabled={!valid}
        whileHover={valid ? { scale: 1.02 } : undefined}
        whileTap={valid ? { scale: 0.98 } : undefined}
        onClick={() => {
          const m = singleAmt ? { ...mapping, credit: mapping.debit } : mapping;
          onConfirm(m, bankName, saveMapping && !!bankName.trim());
        }}
        className="group flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[var(--primary)] to-[#a855f7] px-4 py-2.5 text-sm font-medium text-white shadow-lg shadow-[var(--primary)]/25 disabled:opacity-40 disabled:shadow-none"
      >
        Continue to Review
        <motion.span animate={{ x: [0, 4, 0] }} transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}>
          <ArrowRight className="h-4 w-4" />
        </motion.span>
      </motion.button>
    </motion.div>
  );
}

// ── Step 3: Review ─────────────────────────────────────────────────────

function ReviewStep({
  stagingTxns,
  aiRunning,
  aiError,
  onUpdateTxn,
  onConfirmImport,
  onDiscard,
  onAddRule,
}: {
  stagingTxns: StagedBankTxn[];
  aiRunning: boolean;
  aiError: string | null;
  onUpdateTxn: (id: string, patch: Partial<StagedBankTxn>) => void;
  onConfirmImport: () => void;
  onDiscard: () => void;
  onAddRule: (rule: Omit<CategorizationRule, "id" | "createdAt" | "timesMatched">) => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkCode, setBulkCode] = useState("");
  const [filterStatus, setFilterStatus] = useState<StagedTxnStatus | "ALL">("ALL");
  const [showPreConfirm, setShowPreConfirm] = useState(false);
  const [rulePrompt, setRulePrompt] = useState<{ desc: string; cat: string; code: string } | null>(null);

  const visible = filterStatus === "ALL"
    ? stagingTxns
    : stagingTxns.filter(t => t.status === filterStatus);

  const toggleSelect = (id: string) => setSelected(s => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });

  const selectAll = () => {
    if (selected.size === visible.length) setSelected(new Set());
    else setSelected(new Set(visible.map(t => t.id)));
  };

  const applyBulkCategory = () => {
    if (!bulkCode) return;
    const opt = COA_OPTIONS.find(o => o.code === bulkCode);
    if (!opt) return;
    for (const id of selected) {
      onUpdateTxn(id, { category: opt.label, coaCode: opt.code, status: "CONFIRMED" });
    }
    setSelected(new Set());
    setBulkCode("");
  };

  const handleCategoryChange = (txn: StagedBankTxn, label: string, code: string) => {
    onUpdateTxn(txn.id, { category: label, coaCode: code, status: "CONFIRMED" });
    // Check if user has manually categorized this merchant multiple times → offer rule
    const normalized = txn.description.toLowerCase().replace(/[^a-z\s]/g, "").trim().split(/\s+/).slice(0, 3).join(" ");
    if (normalized.length > 3) setRulePrompt({ desc: normalized, cat: label, code });
  };

  // Summary for pre-confirm
  const toPost = stagingTxns.filter(t => t.status !== "IGNORED" && t.status !== "DUPLICATE");
  const pending = toPost.filter(t => t.status === "PENDING" || !t.category);
  const catBreakdown: Record<string, number> = {};
  for (const t of toPost) {
    const cat = t.category ?? "Uncategorized";
    catBreakdown[cat] = (catBreakdown[cat] ?? 0) + (t.debit || t.credit);
  }

  const statusCounts: Record<string, number> = {};
  for (const t of stagingTxns) statusCounts[t.status] = (statusCounts[t.status] ?? 0) + 1;

  return (
    <motion.div variants={stagger} initial="hidden" animate="show" className="space-y-4">
      {/* Header */}
      <motion.div variants={fadeUp} className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">Review Transactions</h2>
          <p className="text-sm text-[var(--muted-foreground)]">
            {stagingTxns.length} transactions staged · confirm when ready to post to ledger
          </p>
        </div>
        <div className="flex items-center gap-2">
          <motion.button
            onClick={onDiscard}
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.96 }}
            className="flex items-center gap-1 rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm hover:bg-[var(--muted)]"
          >
            <Trash2 className="h-3.5 w-3.5" /> Discard
          </motion.button>
          <motion.button
            onClick={() => setShowPreConfirm(true)}
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.96 }}
            className="flex items-center gap-2 rounded-lg bg-gradient-to-r from-[var(--primary)] to-[#a855f7] px-4 py-1.5 text-sm font-medium text-white shadow-lg shadow-[var(--primary)]/25"
          >
            <CheckCheck className="h-4 w-4" /> Confirm Import
          </motion.button>
        </div>
      </motion.div>

      {/* Status summary chips */}
      <motion.div variants={fadeUp} className="flex flex-wrap gap-2">
        {(["ALL", "PENDING", "AI_SUGGESTED", "RULE_MATCH", "CONFIRMED", "DUPLICATE", "IGNORED"] as const).map(s => {
          const count = s === "ALL" ? stagingTxns.length : (statusCounts[s] ?? 0);
          if (s !== "ALL" && !count) return null;
          return (
            <motion.button
              key={s}
              layout
              onClick={() => setFilterStatus(s)}
              whileHover={{ scale: 1.06 }}
              whileTap={{ scale: 0.94 }}
              transition={SPRING_POP}
              className={cn(
                "rounded-full px-3 py-1 text-xs font-medium",
                filterStatus === s
                  ? "bg-[var(--primary)] text-white shadow-md shadow-[var(--primary)]/30"
                  : "bg-[var(--muted)] text-[var(--muted-foreground)] hover:bg-[var(--border)]"
              )}
            >
              {s === "ALL" ? "All" : STATUS_META[s].label} ({count})
            </motion.button>
          );
        })}
      </motion.div>

      {/* AI running banner */}
      <AnimatePresence>
        {aiRunning && (
          <motion.div
            initial={{ opacity: 0, height: 0, y: -8 }}
            animate={{ opacity: 1, height: "auto", y: 0 }}
            exit={{ opacity: 0, height: 0, y: -8 }}
            className="relative flex items-center gap-3 overflow-hidden rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-300"
          >
            <motion.div
              aria-hidden
              className="absolute inset-0"
              style={{ background: "linear-gradient(110deg, transparent 30%, rgba(59,130,246,0.25), transparent 70%)" }}
              animate={{ x: ["-120%", "120%"] }}
              transition={{ duration: 1.6, repeat: Infinity, ease: "linear" }}
            />
            <Bot className="relative h-4 w-4" />
            <span className="relative font-medium">AI is reading your transactions…</span>
            <span className="relative ml-auto flex gap-1">
              {[0, 1, 2].map(i => (
                <motion.span
                  key={i}
                  className="h-1.5 w-1.5 rounded-full bg-blue-500"
                  animate={{ opacity: [0.3, 1, 0.3], y: [0, -3, 0] }}
                  transition={{ duration: 1, repeat: Infinity, delay: i * 0.18 }}
                />
              ))}
            </span>
          </motion.div>
        )}
      </AnimatePresence>
      {aiError && (
        <motion.div
          variants={fadeUp}
          className="flex items-center gap-2 rounded-xl border border-yellow-200 bg-yellow-50 px-4 py-3 text-sm text-yellow-800 dark:border-yellow-800 dark:bg-yellow-950/40 dark:text-yellow-300"
        >
          <AlertCircle className="h-4 w-4" />
          {aiError} — rule-based matching still applied.
        </motion.div>
      )}

      {/* Bulk actions */}
      <AnimatePresence>
      {selected.size > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -10, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -10, scale: 0.97 }}
          transition={SPRING_SOFT}
          className="flex items-center gap-3 rounded-xl border border-[var(--primary)]/30 bg-[var(--primary)]/5 px-4 py-2.5"
        >
          <span className="text-sm font-medium">{selected.size} selected</span>
          <select
            value={bulkCode}
            onChange={e => setBulkCode(e.target.value)}
            className="rounded border border-[var(--border)] bg-[var(--card)] px-2 py-1 text-xs"
          >
            <option value="">Choose category…</option>
            <optgroup label="Expenses">
              {COA_OPTIONS.filter(o => o.direction === "debit").map(o => (
                <option key={o.code} value={o.code}>{o.label}</option>
              ))}
            </optgroup>
            <optgroup label="Income">
              {COA_OPTIONS.filter(o => o.direction === "credit").map(o => (
                <option key={o.code} value={o.code}>{o.label}</option>
              ))}
            </optgroup>
          </select>
          <motion.button
            onClick={applyBulkCategory}
            disabled={!bulkCode}
            whileHover={bulkCode ? { scale: 1.05 } : undefined}
            whileTap={bulkCode ? { scale: 0.95 } : undefined}
            className="rounded bg-[var(--primary)] px-3 py-1 text-xs text-white disabled:opacity-40"
          >
            Apply
          </motion.button>
          <button
            onClick={() => {
              for (const id of selected) onUpdateTxn(id, { status: "IGNORED" });
              setSelected(new Set());
            }}
            className="ml-auto text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
          >
            Mark ignored
          </button>
        </motion.div>
      )}
      </AnimatePresence>

      {/* Transaction table */}
      <motion.div variants={fadeUp} className="relative rounded-xl border border-[var(--border)] overflow-hidden">
        <ScanSweep active={aiRunning} />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-[var(--border)] bg-[var(--muted)]">
              <tr>
                <th className="px-3 py-2.5 w-8">
                  <input
                    type="checkbox"
                    checked={selected.size === visible.length && visible.length > 0}
                    onChange={selectAll}
                    className="rounded"
                  />
                </th>
                <th className="px-3 py-2.5 text-left text-xs font-semibold text-[var(--muted-foreground)]">Date</th>
                <th className="px-3 py-2.5 text-left text-xs font-semibold text-[var(--muted-foreground)]">Description</th>
                <th className="px-3 py-2.5 text-right text-xs font-semibold text-[var(--muted-foreground)]">Debit</th>
                <th className="px-3 py-2.5 text-right text-xs font-semibold text-[var(--muted-foreground)]">Credit</th>
                <th className="px-3 py-2.5 text-left text-xs font-semibold text-[var(--muted-foreground)] w-52">Category</th>
                <th className="px-3 py-2.5 text-left text-xs font-semibold text-[var(--muted-foreground)]">Status</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((txn, i) => (
                <motion.tr
                  key={txn.id}
                  layout
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: txn.status === "IGNORED" || txn.status === "DUPLICATE" ? 0.4 : 1, y: 0 }}
                  transition={{ delay: Math.min(i * 0.035, 0.6), duration: 0.4, ease: EASE_CINEMATIC }}
                  whileHover={txn.status === "IGNORED" || txn.status === "DUPLICATE" ? undefined : { backgroundColor: "var(--muted)" }}
                  className="border-b border-[var(--border)] last:border-0"
                >
                  <td className="px-3 py-2.5">
                    <input
                      type="checkbox"
                      checked={selected.has(txn.id)}
                      onChange={() => toggleSelect(txn.id)}
                      className="rounded"
                    />
                  </td>
                  <td className="px-3 py-2.5 tabular-nums text-xs text-[var(--muted-foreground)] whitespace-nowrap">
                    {txn.txnDate}
                  </td>
                  <td className="px-3 py-2.5 max-w-xs">
                    <span className={cn("block truncate text-xs", txn.status === "IGNORED" && "line-through")}>
                      {txn.description}
                    </span>
                    {txn.status === "AI_SUGGESTED" && txn.aiConfidence !== undefined && (
                      <motion.span
                        initial={{ opacity: 0, x: -6 }}
                        animate={{ opacity: 1, x: 0 }}
                        className="inline-flex items-center gap-1 text-[10px] text-blue-500"
                      >
                        <Bot className="h-2.5 w-2.5" /> AI {Math.round(txn.aiConfidence * 100)}% confident
                      </motion.span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-xs">
                    {txn.debit > 0 ? <span className="text-[var(--danger)]">₹{fmt(txn.debit)}</span> : "—"}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-xs">
                    {txn.credit > 0 ? <span className="text-[var(--success)]">₹{fmt(txn.credit)}</span> : "—"}
                  </td>
                  <td className="px-3 py-2 w-52">
                    {txn.status === "DUPLICATE" || txn.status === "IGNORED" ? (
                      <span className="text-xs text-[var(--muted-foreground)]">{txn.category ?? "—"}</span>
                    ) : (
                      <CategorySelect
                        value={txn.category}
                        coaCode={txn.coaCode}
                        onChange={(label, code) => handleCategoryChange(txn, label, code)}
                      />
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-1">
                      <Badge status={txn.status} />
                      {txn.status === "DUPLICATE" && (
                        <button
                          onClick={() => onUpdateTxn(txn.id, { status: "PENDING" })}
                          title="Import anyway"
                          className="text-[10px] text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                        >
                          import anyway
                        </button>
                      )}
                    </div>
                  </td>
                </motion.tr>
              ))}
              {visible.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-sm text-[var(--muted-foreground)]">
                    No transactions in this filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </motion.div>

      {/* Save-as-rule prompt */}
      <AnimatePresence>
      {rulePrompt && (
        <motion.div
          initial={{ opacity: 0, y: 16, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 16, scale: 0.97 }}
          transition={SPRING_SOFT}
          className="flex items-center gap-3 rounded-xl border border-[var(--primary)]/30 bg-[var(--card)] p-4 shadow-lg shadow-[var(--primary)]/10"
        >
          <motion.div animate={{ rotate: [0, -10, 10, 0] }} transition={{ duration: 0.6 }}>
            <Bot className="h-5 w-5 text-[var(--primary)] shrink-0" />
          </motion.div>
          <div className="flex-1 text-sm">
            <span>Always categorize &quot;<strong>{rulePrompt.desc}</strong>&quot; as </span>
            <strong>{rulePrompt.cat}</strong>?
          </div>
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => {
              onAddRule({
                pattern: rulePrompt.desc,
                isRegex: false,
                category: rulePrompt.cat,
                coaCode: rulePrompt.code,
                direction: "both",
                isStarter: false,
              });
              setRulePrompt(null);
            }}
            className="rounded-lg bg-[var(--primary)] px-3 py-1.5 text-xs text-white"
          >
            <Save className="mr-1 inline h-3 w-3" /> Save rule
          </motion.button>
          <button onClick={() => setRulePrompt(null)} className="text-[var(--muted-foreground)] hover:text-[var(--foreground)]">
            <X className="h-4 w-4" />
          </button>
        </motion.div>
      )}
      </AnimatePresence>

      {/* Pre-confirm modal */}
      <AnimatePresence>
      {showPreConfirm && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={() => setShowPreConfirm(false)}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 30 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 30 }}
            transition={SPRING_SOFT}
            className="w-full max-w-md rounded-2xl bg-[var(--card)] p-6 shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <h3 className="mb-4 text-lg font-bold">Confirm Import</h3>

            {pending.length > 0 && (
              <motion.div
                initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}
                className="mb-4 flex items-start gap-2 rounded-xl border border-yellow-200 bg-yellow-50 px-3 py-2.5 text-sm text-yellow-800 dark:border-yellow-800 dark:bg-yellow-950/40 dark:text-yellow-300"
              >
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{pending.length} transaction{pending.length > 1 ? "s" : ""} still uncategorized — they&apos;ll post as &quot;Uncategorized&quot;.</span>
              </motion.div>
            )}

            <div className="mb-4 rounded-xl bg-[var(--muted)] p-3 space-y-1">
              <div className="flex justify-between text-sm font-medium">
                <span>Transactions to post</span>
                <span><AnimatedNumber value={toPost.length} decimals={0} duration={0.8} /></span>
              </div>
              <div className="flex justify-between text-sm">
                <span>Total debits</span>
                <span className="text-[var(--danger)]"><AnimatedNumber value={toPost.reduce((s, t) => s + t.debit, 0)} prefix="₹" /></span>
              </div>
              <div className="flex justify-between text-sm">
                <span>Total credits</span>
                <span className="text-[var(--success)]"><AnimatedNumber value={toPost.reduce((s, t) => s + t.credit, 0)} prefix="₹" /></span>
              </div>
            </div>

            <div className="mb-5 space-y-1">
              <p className="text-xs font-semibold text-[var(--muted-foreground)] uppercase tracking-wide">Breakdown by category</p>
              {Object.entries(catBreakdown)
                .sort(([, a], [, b]) => b - a)
                .map(([cat, amt], i) => (
                  <motion.div
                    key={cat}
                    initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.1 + i * 0.05 }}
                    className="flex justify-between text-xs"
                  >
                    <span className="text-[var(--muted-foreground)]">{cat}</span>
                    <span className="tabular-nums">₹{fmt(amt)}</span>
                  </motion.div>
                ))}
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowPreConfirm(false)}
                className="flex-1 rounded-xl border border-[var(--border)] py-2 text-sm hover:bg-[var(--muted)]"
              >
                Back to review
              </button>
              <motion.button
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => { setShowPreConfirm(false); onConfirmImport(); }}
                className="flex-1 rounded-xl bg-gradient-to-r from-[var(--primary)] to-[#a855f7] py-2 text-sm font-medium text-white shadow-lg shadow-[var(--primary)]/25"
              >
                Post to Ledger
              </motion.button>
            </div>
          </motion.div>
        </motion.div>
      )}
      </AnimatePresence>
    </motion.div>
  );
}

// ── Step 4: Confirmed ──────────────────────────────────────────────────

function ConfirmedStep({ count, onImportMore }: { count: number; onImportMore: () => void }) {
  return (
    <motion.div
      variants={stagger}
      initial="hidden"
      animate="show"
      className="mx-auto max-w-lg py-12 text-center space-y-5"
    >
      <ConfettiBurst />
      <motion.div
        variants={fadeUp}
        className="relative mx-auto flex h-24 w-24 items-center justify-center"
      >
        <motion.div
          className="absolute inset-0 rounded-full bg-[var(--success)]/10"
          animate={{ scale: [1, 1.3, 1], opacity: [0.6, 0, 0.6] }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeOut" }}
        />
        <DrawCheck size={88} />
      </motion.div>

      <motion.h2 variants={fadeUp} className="text-3xl font-bold">
        Import complete
      </motion.h2>

      <motion.p variants={fadeUp} className="text-[var(--muted-foreground)]">
        <span className="text-2xl font-bold text-[var(--success)]">
          <AnimatedNumber value={count} decimals={0} duration={1.2} />
        </span>
        {" "}transaction{count !== 1 ? "s" : ""} posted to your ledger.<br />
        They&apos;re now reflected in your P&amp;L, Balance Sheet, and Cash Flow reports.
      </motion.p>

      <motion.div variants={fadeUp} className="flex justify-center gap-3 pt-2">
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={onImportMore}
          className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-[var(--primary)] to-[#a855f7] px-5 py-2.5 text-sm font-medium text-white shadow-lg shadow-[var(--primary)]/25"
        >
          <Upload className="h-4 w-4" /> Import another file
        </motion.button>
        <motion.a
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          href="/book/reports"
          className="flex items-center gap-2 rounded-xl border border-[var(--border)] px-5 py-2.5 text-sm hover:bg-[var(--muted)]"
        >
          View Reports
        </motion.a>
      </motion.div>
    </motion.div>
  );
}

// ── Rules panel ────────────────────────────────────────────────────────

function RulesPanel({
  userRules,
  onAdd,
  onDelete,
  onClose,
}: {
  userRules: CategorizationRule[];
  onAdd: (r: Omit<CategorizationRule, "id" | "createdAt" | "timesMatched">) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState<{
    pattern: string; isRegex: boolean; category: string;
    coaCode: string; direction: "debit" | "credit" | "both";
  }>({
    pattern: "", isRegex: false, category: COA_OPTIONS[5].label,
    coaCode: COA_OPTIONS[5].code, direction: "both",
  });

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-40 flex items-start justify-end bg-black/30 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ x: "110%" }} animate={{ x: 0 }} exit={{ x: "110%" }}
        transition={SPRING_SOFT}
        className="h-full w-full max-w-sm overflow-y-auto rounded-2xl bg-[var(--card)] p-5 shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-bold">Categorization Rules</h3>
          <button onClick={onClose} className="text-[var(--muted-foreground)] hover:text-[var(--foreground)]">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Add rule form */}
        <div className="mb-5 space-y-3 rounded-xl border border-[var(--border)] p-3">
          <p className="text-xs font-semibold text-[var(--muted-foreground)] uppercase">New rule</p>
          <input
            placeholder="Pattern (e.g. 'AMAZON' or 'SAL\d+')"
            value={form.pattern}
            onChange={e => setForm(f => ({ ...f, pattern: e.target.value }))}
            className="w-full rounded border border-[var(--border)] bg-[var(--background)] px-2 py-1.5 text-sm"
          />
          <label className="flex items-center gap-2 text-xs cursor-pointer">
            <input type="checkbox" checked={form.isRegex} onChange={e => setForm(f => ({ ...f, isRegex: e.target.checked }))} className="rounded" />
            Treat as regular expression
          </label>
          <select
            value={form.coaCode}
            onChange={e => {
              const opt = COA_OPTIONS.find(o => o.code === e.target.value);
              if (opt) setForm(f => ({ ...f, category: opt.label, coaCode: opt.code }));
            }}
            className="w-full rounded border border-[var(--border)] bg-[var(--card)] px-2 py-1.5 text-sm"
          >
            {COA_OPTIONS.map(o => <option key={o.code} value={o.code}>{o.label}</option>)}
          </select>
          <select
            value={form.direction}
            onChange={e => setForm(f => ({ ...f, direction: e.target.value as "debit" | "credit" | "both" }))}
            className="w-full rounded border border-[var(--border)] bg-[var(--card)] px-2 py-1.5 text-sm"
          >
            <option value="both">Both debits & credits</option>
            <option value="debit">Debits only</option>
            <option value="credit">Credits only</option>
          </select>
          <button
            disabled={!form.pattern.trim()}
            onClick={() => {
              onAdd({ ...form, isStarter: false });
              setForm(f => ({ ...f, pattern: "" }));
            }}
            className="w-full rounded-lg bg-[var(--primary)] py-1.5 text-sm text-white disabled:opacity-40"
          >
            <Plus className="mr-1 inline h-3 w-3" /> Add rule
          </button>
        </div>

        {/* User rules */}
        {userRules.filter(r => !r.isStarter).length > 0 && (
          <div className="mb-4 space-y-2">
            <p className="text-xs font-semibold text-[var(--muted-foreground)] uppercase">Your rules</p>
            {userRules.filter(r => !r.isStarter).map(r => (
              <div key={r.id} className="flex items-center gap-2 rounded-lg border border-[var(--border)] px-3 py-2">
                <div className="flex-1 min-w-0">
                  <p className="truncate text-xs font-medium">{r.isRegex ? "/" : ""}{r.pattern}{r.isRegex ? "/i" : ""}</p>
                  <p className="truncate text-[10px] text-[var(--muted-foreground)]">{r.category} · {r.direction}</p>
                </div>
                <button onClick={() => onDelete(r.id)} className="text-[var(--muted-foreground)] hover:text-[var(--danger)]">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Starter rules */}
        <div className="space-y-2">
          <p className="text-xs font-semibold text-[var(--muted-foreground)] uppercase">Built-in starter rules</p>
          {STARTER_RULES.map((r, i) => (
            <motion.div
              key={r.id}
              initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.15 + i * 0.02 }}
              className="flex items-center gap-2 rounded-lg bg-[var(--muted)] px-3 py-1.5"
            >
              <div className="flex-1 min-w-0">
                <p className="truncate text-xs text-[var(--muted-foreground)]">{r.pattern} → {r.category}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </motion.div>
    </motion.div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────

function ImportWizard() {
  const { state, actions } = useV2();

  const stagingTxns = state?.stagingTxns ?? [];
  const userRules   = state?.categorizationRules ?? [];
  const bankMappings = state?.bankMappings ?? [];
  const hints = state?.categoryHints ?? [];

  const hasStaging = stagingTxns.length > 0;
  const [step, setStep] = useState<WizardStep>(hasStaging ? "review" : "upload");
  const [confirmedCount, setConfirmedCount] = useState(0);
  const prevStepIdx = useRef(0);

  // In-memory state for the upload→mapping pipeline
  const [fileContent, setFileContent] = useState<string | ArrayBuffer | null>(null);
  const [fileName, setFileName] = useState("");
  const [tabularFormat, setTabularFormat] = useState<TabularFormat>("csv");
  const [reportFormat, setReportFormat] = useState<BankFormat>("CSV");
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvPreviewRows, setCsvPreviewRows] = useState<string[][]>([]);
  const [detectedMapping, setDetectedMapping] = useState<BankColumnMapping | null>(null);
  const [savedMappingName, setSavedMappingName] = useState<string | undefined>();
  const [parseReport, setParseReport] = useState<ParseReport | null>(null);
  const [aiRunning, setAiRunning] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [showRules, setShowRules] = useState(false);

  // When staging txns first arrive, kick off AI for PENDING ones
  useEffect(() => {
    if (!hasStaging) return;
    const pending = stagingTxns.filter(t => t.status === "PENDING");
    if (!pending.length || aiRunning) return;

    setAiRunning(true);
    setAiError(null);
    runAiCategorize(pending)
      .then(results => {
        for (const r of results) {
          if (r.confidence >= 0.6) {
            actions.updateStagingTxn(r.id, {
              category: r.category,
              coaCode: r.coaCode,
              status: "AI_SUGGESTED",
              aiConfidence: r.confidence,
            });
          }
        }
      })
      .catch(e => setAiError(String(e)))
      .finally(() => setAiRunning(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasStaging]);

  const commitToStaging = useCallback((parsed: ParsedBankTxn[], srcFile: string) => {
    const existing = state?.bankTxns ?? [];
    const { fresh, duplicates } = detectDuplicates(existing, parsed);

    const staged: StagedBankTxn[] = [
      ...fresh.map(t => {
        const match = applyCategoryRules(t, userRules, hints);
        return {
          ...t,
          category: match?.category ?? null,
          coaCode: match?.coaCode ?? null,
          status: match ? "RULE_MATCH" : "PENDING" as StagedTxnStatus,
          matchedRuleId: match?.ruleId,
          sourceFile: srcFile,
        } as StagedBankTxn;
      }),
      ...duplicates.map(t => ({
        ...t,
        category: null,
        coaCode: null,
        status: "DUPLICATE" as StagedTxnStatus,
        sourceFile: srcFile,
      })),
    ];

    actions.setStagingTxns(staged);
    setStep("review");
  }, [state?.bankTxns, userRules, hints, actions]);

  // Route a tabular source (file buffer or pasted text) into the mapping step.
  const startMapping = useCallback((
    content: string | ArrayBuffer, format: TabularFormat, srcName: string, reportFmt: BankFormat
  ) => {
    setFileContent(content);
    setFileName(srcName);
    setTabularFormat(format);
    setReportFormat(reportFmt);
    const preview = getCsvPreview(content, format);
    setCsvHeaders(preview.headers);
    setCsvPreviewRows(preview.rows);
    const saved = bankMappings.find(m => m.headerHash === headerHash(preview.headers));
    setDetectedMapping(saved?.mapping ?? preview.detectedMapping);
    setSavedMappingName(saved?.bankName);
    setStep("mapping");
  }, [bankMappings]);

  const handleFile = useCallback(async (file: File) => {
    const ext = (file.name.split(".").pop() ?? "").toLowerCase();
    const buf = await file.arrayBuffer();

    if (ext === "csv" || ext === "tsv") {
      startMapping(buf, ext as TabularFormat, file.name, ext.toUpperCase() as BankFormat);
    } else if (ext === "xls" || ext === "xlsx") {
      startMapping(buf, ext as TabularFormat, file.name, "XLS");
    } else if (ext === "ofx" || ext === "qfx") {
      const { txns, report } = parseOfxContent(new TextDecoder().decode(buf), ext === "ofx" ? "OFX" : "QFX", file.name);
      setParseReport(report);
      commitToStaging(txns, file.name);
    } else if (ext === "qif") {
      const { txns, report } = parseQifContent(new TextDecoder().decode(buf), file.name);
      setParseReport(report);
      commitToStaging(txns, file.name);
    } else if (ext === "xml") {
      const { txns, report } = parseCamtContent(new TextDecoder().decode(buf), file.name);
      setParseReport(report);
      commitToStaging(txns, file.name);
    } else {
      alert("Unsupported file. Use CSV, TSV, XLS/XLSX, OFX, QFX, QIF, or CAMT XML.");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startMapping, commitToStaging]);

  const handlePaste = useCallback((text: string) => {
    const fmt = detectDelimiter(text);
    startMapping(text, fmt, "Pasted statement", "PASTE");
  }, [startMapping]);

  const handleMappingConfirm = useCallback((
    mapping: BankColumnMapping,
    bankName: string,
    save: boolean
  ) => {
    if (!fileContent) return;
    const { txns, report } = mapCsvToBankTxns(fileContent, mapping, fileName, tabularFormat, reportFormat);
    setParseReport(report);

    if (save && bankName) {
      actions.saveBankMapping({
        id: `bm-${Date.now()}`,
        headerHash: headerHash(csvHeaders),
        bankName,
        mapping,
        createdAt: new Date().toISOString().slice(0, 10),
      });
    }

    commitToStaging(txns, fileName);
  }, [fileContent, fileName, tabularFormat, reportFormat, csvHeaders, actions, commitToStaging]);

  const handleConfirmImport = useCallback(() => {
    const toPost = stagingTxns.filter(t => t.status !== "IGNORED" && t.status !== "DUPLICATE");
    setConfirmedCount(toPost.length);
    actions.confirmBankImport(stagingTxns);
    setStep("confirmed");
  }, [stagingTxns, actions]);

  const handleDiscard = useCallback(() => {
    actions.clearStaging();
    setStep("upload");
    setFileContent(null);
    setParseReport(null);
  }, [actions]);

  if (!state) return null;

  const STEP_ORDER: WizardStep[] = ["upload", "mapping", "review", "confirmed"];
  const stepIdx = STEP_ORDER.indexOf(step);
  const direction = stepIdx >= prevStepIdx.current ? 1 : -1;
  prevStepIdx.current = stepIdx;

  const STEP_LABELS: Array<{ key: WizardStep; label: string }> = [
    { key: "upload", label: "Upload" },
    { key: "mapping", label: "Map" },
    { key: "review", label: "Review" },
    { key: "confirmed", label: "Done" },
  ];

  return (
    <div className="relative">

      {/* Page header — animated step progress + Rules button */}
      <div className="mb-6 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          {STEP_LABELS.map((s, i) => {
            const active = s.key === step;
            const done = STEP_ORDER.indexOf(s.key) < stepIdx;
            return (
              <div key={s.key} className="flex items-center gap-2">
                <motion.span
                  className="flex items-center gap-1.5 text-xs font-medium"
                  animate={{
                    color: active ? "var(--primary)" : done ? "var(--success)" : "var(--muted-foreground)",
                    opacity: active || done ? 1 : 0.55,
                  }}
                >
                  <motion.span
                    layout
                    className="flex h-5 w-5 items-center justify-center rounded-full text-[10px]"
                    animate={{
                      backgroundColor: active ? "var(--primary)" : done ? "var(--success)" : "var(--muted)",
                      color: active || done ? "#fff" : "var(--muted-foreground)",
                      scale: active ? 1.15 : 1,
                    }}
                    transition={SPRING_POP}
                  >
                    {done ? <Check className="h-3 w-3" /> : i + 1}
                  </motion.span>
                  <span className="hidden sm:inline">{s.label}</span>
                </motion.span>
                {i < STEP_LABELS.length - 1 && (
                  <span className="h-px w-4 bg-[var(--border)] sm:w-6" />
                )}
              </div>
            );
          })}
        </div>
        {(step === "review" || step === "upload") && (
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setShowRules(true)}
            className="flex shrink-0 items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs hover:bg-[var(--muted)]"
          >
            <Filter className="h-3.5 w-3.5" /> Rules
          </motion.button>
        )}
      </div>

      {/* Skipped-rows note */}
      {step === "review" && parseReport && parseReport.skippedRows.length > 0 && (
        <p className="mb-3 text-xs text-[var(--warning)]">
          {parseReport.fileName} · {parseReport.skippedRows.length} rows skipped during import
        </p>
      )}

      <StepTransition step={step} direction={direction}>
        {step === "upload" && (
          <UploadStep onFile={handleFile} onPaste={handlePaste} />
        )}

        {step === "mapping" && (
          <MappingStep
            fileName={fileName}
            headers={csvHeaders}
            rows={csvPreviewRows}
            initial={detectedMapping}
            savedName={savedMappingName}
            onConfirm={handleMappingConfirm}
            onBack={() => setStep("upload")}
          />
        )}

        {step === "review" && (
          <ReviewStep
            stagingTxns={stagingTxns}
            aiRunning={aiRunning}
            aiError={aiError}
            onUpdateTxn={(id, patch) => actions.updateStagingTxn(id, patch)}
            onConfirmImport={handleConfirmImport}
            onDiscard={handleDiscard}
            onAddRule={r => actions.addCategorizationRule(r)}
          />
        )}

        {step === "confirmed" && (
          <ConfirmedStep
            count={confirmedCount}
            onImportMore={() => {
              setStep("upload");
              setFileContent(null);
              setParseReport(null);
            }}
          />
        )}
      </StepTransition>

      <AnimatePresence>
        {showRules && (
          <RulesPanel
            userRules={userRules}
            onAdd={r => actions.addCategorizationRule(r)}
            onDelete={id => actions.deleteCategorizationRule(id)}
            onClose={() => setShowRules(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Banking hub — top-level tabbed shell ──────────────────────────────

type BankHubView = "accounts" | "import";

const HUB_TABS: { key: BankHubView; label: string }[] = [
  { key: "accounts", label: "Accounts" },
  { key: "import", label: "Import" },
];

export default function BankPage() {
  const { state } = useV2();
  const accounts = state?.bankAccounts ?? [];
  // Land on Accounts first; nudge new users to set one up before importing.
  const [view, setView] = useState<BankHubView>("accounts");

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <div className="mb-6 flex items-center gap-2">
        <div className="flex rounded-xl border border-[var(--border)] bg-[var(--muted)]/40 p-1 text-sm">
          {HUB_TABS.map(t => (
            <button
              key={t.key}
              onClick={() => setView(t.key)}
              className={cn(
                "relative rounded-lg px-4 py-1.5 font-medium transition-colors",
                view === t.key ? "text-white" : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
              )}
            >
              {view === t.key && (
                <motion.span layoutId="bankHubPill" className="absolute inset-0 -z-10 rounded-lg bg-[var(--primary)]" transition={SPRING_SOFT} />
              )}
              {t.label}
              {t.key === "accounts" && accounts.filter(a => !a.archived).length > 0 && (
                <span className="ml-1.5 text-xs opacity-70">{accounts.filter(a => !a.archived).length}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      <StepTransition step={view}>
        {view === "accounts" ? <BankAccounts /> : <ImportWizard />}
      </StepTransition>
    </div>
  );
}
