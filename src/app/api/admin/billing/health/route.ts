import { NextResponse, type NextRequest } from "next/server";

import { requireAdmin } from "@/lib/admin/auth";
import { getSupabaseServiceRole } from "@/lib/supabase/server-admin";

const REQUIRED_TABLES = [
  "tulmin_user_subscriptions",
  "tulmin_billing_settings",
  "tulmin_plan_settings",
  "tulmin_usage_events",
  "tulmin_device_trials",
  "tulmin_payment_events",
  "tulmin_label_credit_grants",
  "tulmin_abuse_events",
  "tulmin_rate_limits",
] as const;

const REQUIRED_FUNCTIONS = [
  "tulmin_reserve_usage_labels",
  "tulmin_usage_totals",
  "tulmin_check_rate_limit",
] as const;

type Check = {
  name: string;
  ok: boolean;
  error?: string;
};

function errorMessage(error: unknown) {
  return error && typeof error === "object" && "message" in error
    ? String(error.message)
    : String(error);
}

export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (admin instanceof NextResponse) return admin;

  const sb = getSupabaseServiceRole();
  if (!sb) {
    return NextResponse.json(
      {
        ok: false,
        setupRequired: true,
        error: "SUPABASE_SERVICE_ROLE_KEY is not configured.",
      },
      { status: 503 }
    );
  }

  const tableChecks = await Promise.all(
    REQUIRED_TABLES.map(async (table): Promise<Check> => {
      const result = await sb.from(table).select("*", { head: true, count: "exact" }).limit(1);
      return {
        name: table,
        ok: !result.error,
        error: result.error ? result.error.message : undefined,
      };
    })
  );

  const functionChecks = await Promise.all(
    REQUIRED_FUNCTIONS.map(async (fn): Promise<Check> => {
      const result = await sb
        .from("information_schema.routines")
        .select("routine_name")
        .eq("routine_schema", "public")
        .eq("routine_name", fn)
        .maybeSingle();
      return {
        name: fn,
        ok: !result.error && Boolean(result.data),
        error: result.error
          ? result.error.message
          : result.data
            ? undefined
            : "Function is missing.",
      };
    })
  );

  const checks = { tables: tableChecks, functions: functionChecks };
  const missing = [...tableChecks, ...functionChecks].filter((check) => !check.ok);

  return NextResponse.json(
    {
      ok: missing.length === 0,
      setupRequired: missing.length > 0,
      checkedAt: new Date().toISOString(),
      checks,
      setupHint:
        missing.length > 0
          ? "Run supabase/migrations/011_billing_foundation_safety.sql and supabase/migrations/010_atomic_usage_reservations.sql in Supabase SQL Editor."
          : undefined,
    },
    { status: missing.length > 0 ? 503 : 200 }
  );
}
