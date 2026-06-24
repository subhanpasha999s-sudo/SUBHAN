"use client";
/** Expenses — fast keyboard-first quick-add, month + search + category filters,
 *  at-a-glance KPIs and a spend-by-category breakdown. Statement-based expenses
 *  live in the dedicated Bank Import module. */
import { useMemo, useState } from "react";
import Link from "next/link";
import { Plus, Search, Landmark, Receipt, Tag, TrendingUp } from "lucide-react";
import { useV2 } from "@/book/lib/v2/store";
import { Guard, PageHeader, fmtDate } from "@/book/components/v2/common";
import { Badge, Button, Card, cn } from "@/book/components/ui";
import { canDo } from "@/book/lib/v2/rbac";
import { formatINR } from "@/book/lib/engine";
import { motion, AnimatePresence, fadeUp, stagger } from "@/book/components/v2/motion";

const CAT_COLORS = ["#7c3aed", "#0ea5e9", "#16a34a", "#f59e0b", "#ef4444", "#14b8a6", "#ec4899", "#94a3b8"];

export default function ExpensesPage() {
  const { state, me, actions } = useV2();
  const mayEdit = canDo(me.role, "add_expense");

  // quick add
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [category, setCategory] = useState(state.expenseCategories[0] ?? "Misc");
  const [desc, setDesc] = useState("");
  const [amount, setAmount] = useState("");
  const [gst, setGst] = useState("");
  const [mode, setMode] = useState("UPI");

  // filters
  const months = useMemo(() => {
    const set = new Set(state.expenses.map((e) => e.expenseDate.slice(0, 7)));
    set.add(new Date().toISOString().slice(0, 7));
    return [...set].sort((a, b) => b.localeCompare(a));
  }, [state.expenses]);
  // Default to the most recent month that actually has expenses (fall back to current).
  const [month, setMonth] = useState<string>(() => {
    const withData = [...new Set(state.expenses.map((e) => e.expenseDate.slice(0, 7)))].sort((a, b) => b.localeCompare(a));
    return withData[0] ?? new Date().toISOString().slice(0, 7);
  });
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState<string>("all");

  const scope = useMemo(
    () => state.expenses.filter((e) => month === "all" || e.expenseDate.startsWith(month)),
    [state.expenses, month]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return [...scope]
      .filter((e) => catFilter === "all" || e.category === catFilter)
      .filter((e) => !q || e.description.toLowerCase().includes(q) || e.category.toLowerCase().includes(q))
      .sort((a, b) => b.expenseDate.localeCompare(a.expenseDate));
  }, [scope, search, catFilter]);

  const stats = useMemo(() => {
    const total = scope.reduce((s, e) => s + e.amount, 0);
    const byCat = new Map<string, number>();
    for (const e of scope) byCat.set(e.category, (byCat.get(e.category) ?? 0) + e.amount);
    const cats = [...byCat.entries()].sort((a, b) => b[1] - a[1]);
    return { total, count: scope.length, avg: scope.length ? total / scope.length : 0, cats };
  }, [scope]);

  function quickAdd() {
    const amt = parseFloat(amount);
    if (!Number.isFinite(amt) || amt <= 0 || !desc.trim()) return;
    actions.addExpense({
      expenseDate: date, category, description: desc.trim(), amount: amt,
      gstAmount: parseFloat(gst) || 0, paymentMode: mode, source: "MANUAL", sourceKey: null,
    });
    setDesc(""); setAmount(""); setGst("");
  }

  const input = "rounded-xl border border-border bg-card px-3 py-2 text-sm outline-none focus:border-primary";
  const monthLabel = month === "all" ? "All time" : new Date(month + "-02").toLocaleString("en-IN", { month: "long", year: "numeric" });

  return (
    <Guard section="expenses">
      <PageHeader title="Expenses" sub="Track business spend. Bank-statement expenses live in Bank Import." />

      {/* Toolbar: month + category share a row on phones; search + import go full-width */}
      <motion.div variants={stagger} initial="hidden" animate="show" className="mb-5 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
        <motion.select variants={fadeUp} className={cn(input, "w-full sm:w-auto")} value={month} onChange={(e) => setMonth(e.target.value)}>
          <option value="all">All time</option>
          {months.map((m) => <option key={m} value={m}>{new Date(m + "-02").toLocaleString("en-IN", { month: "short", year: "numeric" })}</option>)}
        </motion.select>
        <motion.select variants={fadeUp} className={cn(input, "w-full sm:w-auto")} value={catFilter} onChange={(e) => setCatFilter(e.target.value)}>
          <option value="all">All categories</option>
          {state.expenseCategories.map((c) => <option key={c}>{c}</option>)}
        </motion.select>
        <motion.div variants={fadeUp} className="relative col-span-2 sm:flex-1 sm:min-w-[160px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input className={cn(input, "w-full pl-9")} placeholder="Search description or category…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </motion.div>
        <motion.div variants={fadeUp} className="col-span-2 sm:w-auto">
          <Link href="/book/bank" className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-border bg-card px-3 py-2 text-sm hover:bg-muted sm:w-auto sm:justify-start">
            <Landmark className="h-4 w-4 text-muted-foreground" /> Import from bank
          </Link>
        </motion.div>
      </motion.div>

      {/* KPIs */}
      <motion.div variants={stagger} initial="hidden" animate="show" className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi icon={Receipt} label={`Total · ${monthLabel}`} value={formatINR(stats.total, true)} />
        <Kpi icon={Tag} label="Entries" value={String(stats.count)} />
        <Kpi icon={TrendingUp} label="Avg / entry" value={stats.count ? formatINR(stats.avg, true) : "—"} />
        <Kpi icon={Tag} label="Top category" value={stats.cats[0]?.[0] ?? "—"} sub={stats.cats[0] ? formatINR(stats.cats[0][1], true) : undefined} />
      </motion.div>

      <div className="space-y-6 lg:grid lg:grid-cols-3 lg:gap-6 lg:space-y-0">
        {/* Main column: quick add + list */}
        <div className="min-w-0 space-y-5 lg:col-span-2">
          {mayEdit && (
            <motion.div variants={fadeUp} initial="hidden" animate="show">
              <Card className="p-4">
               <div onKeyDown={(e) => { if (e.key === "Enter") quickAdd(); }}>
                <div className="grid grid-cols-2 gap-2 md:grid-cols-6">
                  <input className={cn(input, "w-full min-w-0")} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
                  <select className={cn(input, "w-full min-w-0")} value={category} onChange={(e) => setCategory(e.target.value)}>
                    {state.expenseCategories.map((c) => <option key={c}>{c}</option>)}
                  </select>
                  <input autoFocus className={cn(input, "col-span-2 w-full min-w-0 md:col-span-2")} placeholder="Description *" value={desc} onChange={(e) => setDesc(e.target.value)} />
                  <input className={cn(input, "w-full min-w-0")} placeholder="₹ amount *" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
                  <div className="flex min-w-0 gap-2">
                    <input className={cn(input, "min-w-0 flex-1 md:w-20")} placeholder="GST ₹" inputMode="decimal" value={gst} onChange={(e) => setGst(e.target.value)} />
                    <motion.div whileTap={{ scale: 0.94 }}>
                      <Button onClick={quickAdd} className="h-full shrink-0"><Plus className="h-4 w-4" /></Button>
                    </motion.div>
                  </div>
                </div>
                <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
                  {["UPI", "Cash", "Bank", "Card"].map((m) => (
                    <label key={m} className="flex items-center gap-1">
                      <input type="radio" checked={mode === m} onChange={() => setMode(m)} className="accent-[var(--primary)]" /> {m}
                    </label>
                  ))}
                  <span className="ml-auto">Press <kbd className="rounded bg-muted px-1">Enter</kbd> to add</span>
                </div>
               </div>
              </Card>
            </motion.div>
          )}

          <Card className="overflow-hidden">
            {/* Table — tablet & up */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-3 py-2.5">Date</th>
                    <th className="px-3 py-2.5">Category</th>
                    <th className="px-3 py-2.5">Description</th>
                    <th className="px-3 py-2.5">Source</th>
                    <th className="px-3 py-2.5 text-right">GST</th>
                    <th className="px-3 py-2.5 text-right">Amount</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  <AnimatePresence initial={false}>
                    {filtered.map((e, i) => (
                      <motion.tr
                        key={e.id}
                        layout
                        initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                        transition={{ delay: Math.min(i * 0.015, 0.3) }}
                        className="border-b border-border last:border-0 hover:bg-muted/60"
                      >
                        <td className="whitespace-nowrap px-3 py-2 text-xs">{fmtDate(e.expenseDate)}</td>
                        <td className="px-3 py-2"><Badge>{e.category}</Badge></td>
                        <td className="max-w-[260px] truncate px-3 py-2">{e.description}</td>
                        <td className="px-3 py-2 text-xs text-muted-foreground">{e.source.toLowerCase().replace("_", " ")}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{e.gstAmount ? formatINR(e.gstAmount) : "—"}</td>
                        <td className="px-3 py-2 text-right font-medium tabular-nums">{formatINR(e.amount)}</td>
                        <td className="px-2 py-2">
                          {mayEdit && e.source === "MANUAL" && (
                            <button className="text-xs text-muted-foreground hover:text-danger" onClick={() => actions.deleteExpense(e.id)}>✕</button>
                          )}
                        </td>
                      </motion.tr>
                    ))}
                  </AnimatePresence>
                </tbody>
              </table>
            </div>

            {/* Card list — phones */}
            <div className="divide-y divide-border md:hidden">
              <AnimatePresence initial={false}>
                {filtered.map((e, i) => (
                  <motion.div
                    key={e.id}
                    layout
                    initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                    transition={{ delay: Math.min(i * 0.02, 0.3) }}
                    className="flex items-start gap-3 px-4 py-3"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{e.description}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                        <Badge>{e.category}</Badge>
                        <span>{fmtDate(e.expenseDate)}</span>
                        <span>· {e.source.toLowerCase().replace("_", " ")}</span>
                        {e.gstAmount ? <span>· GST {formatINR(e.gstAmount)}</span> : null}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="font-medium tabular-nums">{formatINR(e.amount)}</span>
                      {mayEdit && e.source === "MANUAL" && (
                        <button className="text-muted-foreground hover:text-danger" onClick={() => actions.deleteExpense(e.id)}>✕</button>
                      )}
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>

            {filtered.length === 0 && (
              <p className="px-3 py-10 text-center text-sm text-muted-foreground">
                {scope.length === 0 ? "No expenses in this period." : "No matches for your filters."}
              </p>
            )}
          </Card>
        </div>

        {/* Side column: spend by category */}
        <motion.div variants={fadeUp} initial="hidden" animate="show" className="min-w-0">
          <Card className="p-5">
            <h3 className="mb-1 font-semibold">Spend by category</h3>
            <p className="mb-4 text-xs text-muted-foreground">{monthLabel}</p>
            {stats.cats.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">Nothing yet.</p>
            ) : (
              <div className="space-y-3">
                {stats.cats.slice(0, 8).map(([cat, amt], i) => {
                  const w = stats.total > 0 ? Math.max(2, Math.round((amt / stats.total) * 100)) : 0;
                  const color = CAT_COLORS[i % CAT_COLORS.length];
                  return (
                    <button key={cat} onClick={() => setCatFilter(catFilter === cat ? "all" : cat)} className="group block w-full text-left">
                      <div className="mb-1 flex items-center justify-between text-xs">
                        <span className="inline-flex items-center gap-1.5">
                          <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />
                          <span className={cn("font-medium", catFilter === cat && "text-primary")}>{cat}</span>
                        </span>
                        <span className="tabular-nums text-muted-foreground">{formatINR(amt, true)} · {w}%</span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-muted">
                        <motion.div
                          className="h-full rounded-full"
                          style={{ background: color }}
                          initial={{ width: 0 }} animate={{ width: `${w}%` }}
                          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1], delay: i * 0.05 }}
                        />
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </Card>
        </motion.div>
      </div>
    </Guard>
  );
}

function Kpi({ icon: Icon, label, value, sub }: { icon: typeof Receipt; label: string; value: string; sub?: string }) {
  return (
    <motion.div variants={fadeUp}>
      <Card className="p-4">
        <div className="mb-2 flex items-center gap-1.5 text-xs text-muted-foreground">
          <Icon className="h-3.5 w-3.5" /> {label}
        </div>
        <p className="truncate text-xl font-bold">{value}</p>
        {sub && <p className="text-xs text-muted-foreground tabular-nums">{sub}</p>}
      </Card>
    </motion.div>
  );
}
