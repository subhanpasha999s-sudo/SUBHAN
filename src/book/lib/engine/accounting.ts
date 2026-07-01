/**
 * Accounting foundation — Chart of Accounts (COA) + GL entry types.
 *
 * GL entries are DERIVED from V2State (never stored separately), so all
 * historical data is automatically included — no backfill step required.
 *
 * Standard: informal internal use, not GAAP/IFRS certified.
 * Normal sides: Assets/Expenses = debit-normal; Liabilities/Equity/Revenue = credit-normal.
 */

export type CoaType = "asset" | "liability" | "equity" | "revenue" | "expense";

export interface CoaAccount {
  code: string;
  name: string;
  type: CoaType;
  /** True for Liabilities, Equity, Revenue — credits increase the normal balance. */
  creditNormal: boolean;
}

export const COA = {
  // ASSETS (1xxx) — debit-normal
  CASH:         { code: "1000", name: "Cash & Bank Receipts",      type: "asset",     creditNormal: false },
  AR:           { code: "1100", name: "Accounts Receivable",        type: "asset",     creditNormal: false },
  INVENTORY:    { code: "1200", name: "Inventory",                  type: "asset",     creditNormal: false },
  TDS_REC:      { code: "1300", name: "TDS Receivable",             type: "asset",     creditNormal: false },
  TCS_REC:      { code: "1400", name: "TCS Receivable",             type: "asset",     creditNormal: false },
  // LIABILITIES (2xxx) — credit-normal
  AP:           { code: "2000", name: "Accounts Payable",           type: "liability", creditNormal: true  },
  GST_PAYABLE:  { code: "2100", name: "GST Payable",                type: "liability", creditNormal: true  },
  // EQUITY (3xxx) — credit-normal
  RETAINED:     { code: "3000", name: "Retained Earnings",          type: "equity",    creditNormal: true  },
  OWNER_EQUITY: { code: "3100", name: "Owner Equity",               type: "equity",    creditNormal: true  },
  // REVENUE (4xxx) — credit-normal
  SALES:        { code: "4000", name: "Sales Revenue",              type: "revenue",   creditNormal: true  },
  EXCHANGE_REV: { code: "4100", name: "Exchange Income",            type: "revenue",   creditNormal: true  },
  CLAIM_REV:    { code: "4200", name: "Claims & Compensation",      type: "revenue",   creditNormal: true  },
  LOST_COMP:    { code: "4300", name: "Lost Order Compensation",    type: "revenue",   creditNormal: true  },
  // EXPENSES (5xxx–6xxx) — debit-normal
  COGS:         { code: "5000", name: "Cost of Goods Sold",         type: "expense",   creditNormal: false },
  RETURN_LOSS:  { code: "5100", name: "Return & RTO Losses",        type: "expense",   creditNormal: false },
  PLATFORM_FEE: { code: "6000", name: "Platform & Affiliate Fees",  type: "expense",   creditNormal: false },
  ADS:          { code: "6100", name: "Advertising",                type: "expense",   creditNormal: false },
  QC_WRITEOFF:  { code: "6200", name: "QC Damage Write-offs",       type: "expense",   creditNormal: false },
  OPERATING:    { code: "6300", name: "Operating Expenses",         type: "expense",   creditNormal: false },
} as const satisfies Record<string, CoaAccount>;

export type CoaKey = keyof typeof COA;
export const COA_LIST: CoaAccount[] = Object.values(COA) as CoaAccount[];

// ── GL Entry ─────────────────────────────────────────────────────────

export type GlSourceType =
  | "order_settlement"
  | "purchase"
  | "expense"
  | "cogs"
  | "adjustment"
  | "bank_import"
  | "payment"
  | "invoice"
  | "bill";

export interface GlEntry {
  id: string;
  date: string;         // YYYY-MM-DD
  debitCode: string;    // COA code being debited
  creditCode: string;   // COA code being credited
  amount: number;       // always positive
  description: string;
  sourceType: GlSourceType;
  sourceId: string;     // subOrderNo / purchaseId / expenseId
}

// ── Balance helpers ───────────────────────────────────────────────────

/**
 * Natural balance: positive means the account has the expected type of balance.
 *   Debit-normal (assets/expenses): positive = debits exceed credits.
 *   Credit-normal (liabilities/equity/revenue): positive = credits exceed debits.
 */
export function naturalBalance(
  entries: GlEntry[],
  account: CoaAccount,
  asOf?: string
): number {
  const es = asOf ? entries.filter((e) => e.date <= asOf) : entries;
  let dr = 0, cr = 0;
  for (const e of es) {
    if (e.debitCode === account.code) dr += e.amount;
    if (e.creditCode === account.code) cr += e.amount;
  }
  return account.creditNormal ? cr - dr : dr - cr;
}

export interface TrialBalanceRow {
  account: CoaAccount;
  debit: number;
  credit: number;
  balance: number;
}

export function trialBalance(entries: GlEntry[], asOf?: string): TrialBalanceRow[] {
  return COA_LIST.map((account) => {
    const es = asOf ? entries.filter((e) => e.date <= asOf) : entries;
    let dr = 0, cr = 0;
    for (const e of es) {
      if (e.debitCode === account.code) dr += e.amount;
      if (e.creditCode === account.code) cr += e.amount;
    }
    return { account, debit: dr, credit: cr, balance: account.creditNormal ? cr - dr : dr - cr };
  });
}
