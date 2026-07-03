/**
 * RBAC (spec Part 11) — UI layer (layer 3 of 3).
 * Layer 1 = RLS in supabase/migrations, layer 2 = requireRole() in server
 * actions. This map drives navigation visibility and deep-link guards.
 */
import { Role } from "./types";

export type AppSection =
  | "dashboard" | "orders" | "settlements" | "inventory" | "purchases"
  | "returns" | "expenses" | "pnl" | "analytics" | "gst" | "team"
  | "integrations" | "mapping" | "vendors" | "reconciliation" | "reports" | "bank" | "ledger" | "invoices" | "customers" | "matching" | "tulmin";

const FINANCIAL_READ: Role[] = ["owner", "manager", "accountant", "viewer"];

export const SECTION_ACCESS: Record<AppSection, Role[]> = {
  dashboard: FINANCIAL_READ, // returns_manager gets the Returns home instead
  orders: FINANCIAL_READ,
  settlements: FINANCIAL_READ,
  inventory: ["owner", "manager", "viewer"],
  purchases: ["owner", "manager", "accountant", "viewer"],
  vendors: ["owner", "manager", "accountant"],
  returns: ["owner", "manager", "returns_manager", "viewer"],
  expenses: ["owner", "manager", "accountant", "viewer"],
  pnl: FINANCIAL_READ,
  analytics: FINANCIAL_READ,
  gst: ["owner", "manager", "accountant"],
  team: ["owner"],
  integrations: ["owner", "manager"], // replaces the old plain "upload"
  mapping: ["owner", "manager"],
  reconciliation: FINANCIAL_READ,
  reports: ["owner", "manager", "accountant"],
  bank:    ["owner", "manager", "accountant"],
  matching: ["owner", "manager", "accountant"],
  ledger:  ["owner", "manager", "accountant"],
  invoices: ["owner", "manager", "accountant", "viewer"],
  customers: ["owner", "manager", "accountant", "viewer"],
  tulmin:  ["owner", "manager", "returns_manager", "accountant", "viewer"],
};

export function canSee(role: Role, section: AppSection): boolean {
  return SECTION_ACCESS[section].includes(role);
}

/** Mutations, checked again in server actions (layer 2) and RLS (layer 1). */
export const CAN_DO: Record<string, Role[]> = {
  upload_files: ["owner", "manager"],
  edit_skus: ["owner", "manager"],
  override_cogs: ["owner"],
  add_purchase: ["owner", "manager"],
  stock_adjustment: ["owner", "manager"],
  qc_decision: ["owner", "manager", "returns_manager"],
  raise_claim: ["owner", "manager", "returns_manager"],
  print_labels: ["owner", "manager", "returns_manager"],
  add_expense: ["owner", "manager", "accountant"],
  manage_invoices: ["owner", "manager", "accountant"],
  record_payment: ["owner", "manager", "accountant"],
  manage_team: ["owner"],
  mark_disputed: ["owner", "manager"],
  export_reports: ["owner", "manager", "accountant"],
};

export function canDo(role: Role, action: keyof typeof CAN_DO): boolean {
  return CAN_DO[action]?.includes(role) ?? false;
}

/** Where each role lands after sign-in. */
export function homeFor(role: Role): string {
  return role === "returns_manager" ? "/book/returns" : "/book/dashboard";
}

export const ROLE_LABELS: Record<Role, string> = {
  owner: "Owner",
  manager: "Manager",
  returns_manager: "Returns/QC Manager",
  accountant: "Accountant",
  viewer: "Viewer",
};
