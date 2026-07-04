/**
 * Custom fields (Phase 10, spec §5.10) — user-defined fields on core entities,
 * pure definition + validation. Values are stored as strings on the entity
 * (`customFields[defId]`) so they serialize with the blob and export to CSV as-is.
 */

export type CustomFieldType = "text" | "number" | "date" | "select" | "checkbox";
export type CustomFieldEntity = "customer" | "invoice" | "vendor";

export const CUSTOM_FIELD_ENTITIES: { id: CustomFieldEntity; label: string }[] = [
  { id: "customer", label: "Customers" },
  { id: "invoice", label: "Invoices" },
  { id: "vendor", label: "Vendors" },
];

export interface CustomFieldDef {
  id: string;
  entity: CustomFieldEntity;
  label: string;
  type: CustomFieldType;
  options?: string[];   // for "select"
  createdAt: string;
}

export function fieldsForEntity(defs: CustomFieldDef[], entity: CustomFieldEntity): CustomFieldDef[] {
  return defs.filter((d) => d.entity === entity);
}

export interface ValidateResult {
  ok: boolean;
  /** Normalized string to store (empty string clears the field). */
  value: string;
  message?: string;
}

/** Validate + normalize a raw input for a field def. Empty is always allowed. */
export function validateFieldValue(def: CustomFieldDef, raw: string): ValidateResult {
  const v = (raw ?? "").trim();
  if (v === "") return { ok: true, value: "" };

  switch (def.type) {
    case "number": {
      const n = Number(v.replace(/,/g, ""));
      if (!Number.isFinite(n)) return { ok: false, value: v, message: `${def.label} must be a number.` };
      return { ok: true, value: String(n) };
    }
    case "date": {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(new Date(`${v}T00:00:00Z`).getTime())) {
        return { ok: false, value: v, message: `${def.label} must be a date (YYYY-MM-DD).` };
      }
      return { ok: true, value: v };
    }
    case "select": {
      const opts = def.options ?? [];
      if (!opts.includes(v)) return { ok: false, value: v, message: `${def.label} must be one of: ${opts.join(", ")}.` };
      return { ok: true, value: v };
    }
    case "checkbox": {
      const truthy = ["true", "yes", "1", "on"].includes(v.toLowerCase());
      return { ok: true, value: truthy ? "true" : "false" };
    }
    default:
      return { ok: true, value: v };
  }
}

/** Human-readable rendering of a stored value. */
export function formatFieldValue(def: CustomFieldDef, value: string | undefined): string {
  if (value == null || value === "") return "—";
  if (def.type === "checkbox") return value === "true" ? "Yes" : "No";
  return value;
}

/** Column headers for a CSV export of an entity's custom fields. */
export function customFieldHeaders(defs: CustomFieldDef[], entity: CustomFieldEntity): string[] {
  return fieldsForEntity(defs, entity).map((d) => d.label);
}
