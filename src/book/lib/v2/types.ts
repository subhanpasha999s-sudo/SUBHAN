/**
 * V2 application entity types — mirror the Postgres schema (supabase/migrations).
 * The demo provider stores these in the browser; the Supabase provider maps
 * them 1:1 onto tables.
 */
import {
  ExpenseRecord,
  LedgerEvent,
  OrderRow,
  PaymentEvent,
  SkuMapEntry,
} from "@/book/lib/engine";

export type Role = "owner" | "manager" | "returns_manager" | "accountant" | "viewer";

export interface OrgUser {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  role: Role;
  active: boolean;
}

export interface Org {
  name: string;
  gstin: string;
  state: string;
  plan: string;
  settleAfterDays: number;
}

export interface Sku {
  skuCode: string;
  productName: string;
  category: string;
  sizeSet: string;
  currentCogs: number;
  gstRate: number;
  hsnCode: string;
  reorderLevel: number;
  status: "active" | "archived";
  // V4 §6a — extended product fields
  imageUrl?: string;       // data URL (demo) / Supabase Storage URL (prod)
  gstInclusive?: boolean;  // is currentCogs / sellingRate GST-inclusive?
  openingStock?: number;   // opening stock units
  sellingRate?: number;    // intended selling price
}

/** V4 §6b — vendor master for purchase bills. */
export interface Vendor {
  id: string;
  name: string;
  gstin: string;
  address: string;
  contact: string;
  /** Phase 2 (upgrade spec §5.2) — optional contact enrichment. */
  state?: string;
  email?: string;
  notes?: string;
  createdAt: string;
}

export interface CogsHistoryEntry {
  skuCode: string;
  oldCogs: number;
  newCogs: number;
  reason: "PURCHASE_AVG" | "MANUAL";
  at: string;
  by: string;
}

export interface Purchase {
  id: string;
  vendorId?: string; // V4 §6b
  supplierName: string;
  invoiceNo: string;
  invoiceDate: string;
  totalAmount: number;
  gstAmount: number;
  paymentStatus: "paid" | "pending" | "partial";
  notes: string;
  items: { skuCode: string; quantity: number; unitCost: number; gstRate: number }[];
  dueDate?: string;     // for AP aging buckets (§2.8)
  amountPaid?: number;  // running paid total when matched to bank txns
  /** Phase 4 — total vendor credits applied (reduces AP outstanding, not cash). */
  amountCredited?: number;
}

/** One line of a purchase order (same shape as Purchase items). */
export interface PurchaseOrderItem {
  skuCode: string;
  quantity: number;
  unitCost: number;
  gstRate: number;
}

/**
 * Phase 4 — purchase order. Non-financial until received (a PO is a
 * commitment, not a liability). "Receive" converts it into a Purchase bill
 * through the existing addPurchase path (stock IN + weighted-avg COGS + AP),
 * grossing unit costs up by the allocated landed cost first.
 */
export interface PurchaseOrder {
  id: string;
  vendorId?: string;
  supplierName: string;
  number: string;        // PO-0001
  date: string;
  expectedDate?: string;
  items: PurchaseOrderItem[];
  /** Freight/duty to allocate onto item costs on receive. */
  landedCost?: number;
  landedCostBasis?: "value" | "quantity";
  status: "open" | "received" | "cancelled";
  notes?: string;
  purchaseId?: string;   // set on receive
}

/**
 * Phase 4 — vendor credit against a bill (v1 mirrors customer credit notes:
 * bill-linked, auto-applied, clamped to the unpaid outstanding).
 * Posts DR Accounts Payable / CR Inventory on ledger sync.
 */
export interface VendorCredit {
  id: string;
  purchaseId: string;
  number: string;        // VC-0001
  amount: number;
  date: string;
  reason?: string;
}

export interface ReturnsQueueItem {
  id: string;
  subOrderNo: string;
  skuCode: string;
  returnType: "RTO" | "CUSTOMER_RETURN" | "EXCHANGE_RETURN";
  receivedDate: string | null;
  qcStatus: "PENDING" | "DONE";
  qcResult: "SELLABLE" | "DAMAGED" | "DAMAGED_REPAIRABLE" | "MISMATCH" | null;
  qcNotes: string;
  qcBy: string | null;
  restocked: boolean;
  createdAt: string;
}

export interface Claim {
  id: string;
  subOrderNo: string;
  skuCode: string;
  raisedDate: string;
  ticketRef: string;
  status: "RAISED" | "APPROVED" | "REJECTED" | "PAID";
  amountClaimed: number;
  amountReceived: number;
  notes: string;
}

export interface StoredExpense extends ExpenseRecord {
  id: string;
  createdBy: string;
}

export interface UploadRecord {
  id: string;
  fileName: string;
  fileType: "ORDERS_CSV" | "PAYMENTS_XLSX" | "BANK_STATEMENT";
  fileHash: string;
  monthLabel: string;
  rowCount: number;
  matched: number;
  unmatched: number;
  at: string;
}

// ── Bank accounts (§2.1) ──────────────────────────────────────────────

export type BankAccountType = "bank" | "credit_card" | "cash";

export interface BankAccount {
  id: string;
  name: string;              // user label, e.g. "HDFC Current"
  bankName: string;
  accountNumberLast4: string; // only last 4 stored
  currency: string;          // ISO code, e.g. "INR"
  accountType: BankAccountType;
  openingBalance: number;
  archived?: boolean;        // soft-delete (keep txns for audit)
  createdAt: string;
}

/** One categorized slice of a bank transaction (§2.3 splits). */
export interface TransactionSplit {
  id: string;
  amount: number;
  coaCode: string;
  category: string;          // COA label
  vendorId?: string;
  memo?: string;
}

/**
 * Persistent bank transaction (§3). Lives in V2State after an import is
 * confirmed. `status` mirrors the brief: uncategorized / categorized /
 * excluded / transfer_pending (legacy IGNORED kept for old data).
 */
export interface StoredBankTxn {
  id: string;
  bankAccountId?: string;
  txnDate: string;
  description: string;
  rawDescription?: string;   // original statement line
  referenceNumber?: string;
  debit: number;
  credit: number;
  status: "PENDING" | "CATEGORIZED" | "EXCLUDED" | "TRANSFER_PENDING" | "IGNORED";
  category?: string;
  coaCode?: string;          // COA account code for GL posting (single-category)
  vendorId?: string;
  splits?: TransactionSplit[]; // present when the txn is split across categories
  matchedBillId?: string;    // linked Purchase (AP)
  matchedInvoiceId?: string; // linked Invoice (AR)
  matchedBatchId?: string;   // Phase 5 — linked Meesho payout batch (Transaction ID)
  transferPairId?: string;   // linked counterpart txn when this is a transfer
  bankTxnId?: string;        // OFX FITID / CAMT ref — used for dedup
  sourceFile?: string;       // original file name for audit trail
  importBatchId?: string;
  importSessionId?: string;
}

// ── Customers & Invoices (Accounts Receivable, §3) ────────────────────

export interface Customer {
  id: string;
  name: string;
  /** Phase 2 (upgrade spec §5.2) — optional contact enrichment. */
  gstin?: string;
  state?: string;   // GST place-of-supply state
  phone?: string;
  email?: string;
  address?: string;
  notes?: string;
  defaultCoaCode?: string;
  createdFromTxnId?: string;
  createdAt: string;
}

export interface Invoice {
  id: string;
  customerId: string;
  number: string;
  amount: number;
  amountPaid: number;
  /** Phase 3 — total credited via credit notes (reduces outstanding, not cash). */
  amountCredited?: number;
  invoiceDate: string;
  dueDate: string;
  status: "open" | "partial" | "paid";
  notes?: string;
  /** Phase 3 — when the last overdue reminder was raised (throttles nudges). */
  lastReminderAt?: string;
}

/**
 * Phase 3 — credit note against an invoice (v1: always invoice-linked and
 * auto-applied, clamped to the outstanding balance; standalone customer
 * credits and cash refunds are deferred — see GAP_ANALYSIS).
 * Posts DR Sales / CR Accounts Receivable on ledger sync.
 */
export interface CreditNote {
  id: string;
  customerId: string;
  invoiceId: string;
  number: string;       // CN-0001
  amount: number;
  date: string;
  reason?: string;
  status: "applied";
}

/**
 * Phase 3 — estimate/quote. Non-financial document (never posts to the
 * ledger); converts into an invoice which then posts AR as usual.
 */
export interface Estimate {
  id: string;
  customerId: string;
  number: string;        // EST-0001
  amount: number;
  date: string;
  expiryDate?: string;
  status: "open" | "accepted" | "declined" | "invoiced";
  notes?: string;
  invoiceId?: string;    // set on conversion
}

/**
 * Phase 3 — recurring invoice schedule. No server jobs exist (STACK.md), so
 * due schedules are materialized client-side when the invoices screen loads
 * (same catch-up pattern as ADS_AUTO). Advancing nextRunDate makes it
 * idempotent: each due occurrence creates exactly one invoice.
 */
export interface RecurringInvoice {
  id: string;
  customerId: string;
  amount: number;
  cadence: "monthly";
  dayOfMonth: number;    // 1–28 recommended; >28 clamps to month end
  nextRunDate: string;   // YYYY-MM-DD of the next due occurrence
  active: boolean;
  notes?: string;
  lastRunDate?: string;
}

/** A payment received against an invoice (discrete, so it posts idempotently). */
export interface Receipt {
  id: string;
  invoiceId: string;
  amount: number;
  date: string;
  reference?: string;
}

/** A payment made against a purchase bill (discrete, posts DR AP / CR Cash). */
export interface BillPayment {
  id: string;
  purchaseId: string;
  amount: number;
  date: string;
  reference?: string;
}

/** One statement import run (§3 ImportBatch). */
export interface ImportBatch {
  id: string;
  bankAccountId?: string;
  fileName: string;
  fileType: string;
  rowsParsed: number;
  rowsImported: number;
  rowsDuplicate: number;
  importedBy: string;
  importedAt: string;
}

// ── Bank import staging ───────────────────────────────────────────────

export type StagedTxnStatus =
  | "PENDING"       // no category matched yet
  | "RULE_MATCH"    // matched by a categorization rule
  | "AI_SUGGESTED"  // AI suggested, needs user review
  | "CONFIRMED"     // user confirmed
  | "DUPLICATE"     // flagged as duplicate of existing txn
  | "IGNORED";      // user chose to skip

export interface StagedBankTxn {
  id: string;
  txnDate: string;
  description: string;
  debit: number;
  credit: number;
  bankTxnId?: string;
  category: string | null;
  coaCode: string | null;
  status: StagedTxnStatus;
  aiConfidence?: number;    // 0–1 when AI_SUGGESTED
  matchedRuleId?: string;
  sourceFile: string;
}

export interface SavedBankMapping {
  id: string;
  headerHash: string;    // hash of header row for auto-detection
  bankName: string;      // user-supplied label
  mapping: import("@/book/lib/engine").BankColumnMapping;
  createdAt: string;
}

export interface CategorizationRule {
  id: string;
  pattern: string;
  isRegex: boolean;
  category: string;      // display name (COA label)
  coaCode: string;       // COA account code
  direction: "debit" | "credit" | "both";
  isStarter: boolean;    // built-in vs user-created
  timesMatched: number;
  createdAt: string;
}

export interface AuditEntry {
  at: string;
  actor: string;
  action: string;
  entity: string;
  entityId: string;
  details?: string;
}

/** Whole-org state — the demo provider persists this in localStorage. */
export interface V2State {
  org: Org;
  users: OrgUser[];
  currentUserId: string;
  skus: Sku[];
  cogsHistory: CogsHistoryEntry[];
  purchases: Purchase[];
  ledger: LedgerEvent[];
  orders: OrderRow[]; // OrderRow.subOrderNo unique
  events: PaymentEvent[];
  returnsQueue: ReturnsQueueItem[];
  claims: Claim[];
  expenses: StoredExpense[];
  bankTxns: StoredBankTxn[];
  categoryHints: { pattern: string; category: string }[];
  expenseCategories: string[];
  uploads: UploadRecord[];
  disputed: string[];
  audit: AuditEntry[];
  /** V3: listing SKU → inventory SKU mapping (incl. bundles). */
  skuMap: SkuMapEntry[];
  vendors: Vendor[];
  /** V3: notification center feed (newest last). */
  notifications: AppNotification[];
  /** V3: per-org email-in inbound address (demo stub). */
  inboundAddress: string;
  /** Bank import staging — cleared after confirm. */
  stagingTxns: StagedBankTxn[];
  /** Saved CSV column mappings per bank. */
  bankMappings: SavedBankMapping[];
  /** User-defined + starter categorization rules. */
  categorizationRules: CategorizationRule[];
  /** Banking module (§3). */
  bankAccounts: BankAccount[];
  customers: Customer[];
  invoices: Invoice[];
  receipts: Receipt[];
  creditNotes: CreditNote[];
  estimates: Estimate[];
  recurringInvoices: RecurringInvoice[];
  billPayments: BillPayment[];
  purchaseOrders: PurchaseOrder[];
  vendorCredits: VendorCredit[];
  /** Phase 8 — resolutions for settlement-exception keys (settlement 2.0). */
  settlementResolutions: SettlementResolution[];
  importBatches: ImportBatch[];
}

/** Phase 8 — a user's decision on one settlement exception. */
export interface SettlementResolution {
  key: string;
  action: "resolved" | "ignored";
  note?: string;
  at: string;
  by: string;
}

export interface AppNotification {
  id: string;
  at: string;
  kind: "import" | "low_stock" | "qc_aging" | "unpaid_aging" | "settlement" | "info";
  title: string;
  body: string;
  read: boolean;
}
