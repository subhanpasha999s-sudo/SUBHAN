import { describe, it, expect } from "vitest";
import {
  validateFieldValue, formatFieldValue, fieldsForEntity, customFieldHeaders,
  type CustomFieldDef,
} from "./customFields";

const def = (over: Partial<CustomFieldDef>): CustomFieldDef => ({
  id: "f1", entity: "customer", label: "Field", type: "text", createdAt: "2026-07-01", ...over,
});

describe("validateFieldValue", () => {
  it("allows empty (clears) for any type", () => {
    expect(validateFieldValue(def({ type: "number" }), "")).toEqual({ ok: true, value: "" });
  });
  it("number: rejects non-numeric, strips commas", () => {
    expect(validateFieldValue(def({ type: "number", label: "Credit days" }), "abc").ok).toBe(false);
    expect(validateFieldValue(def({ type: "number" }), "1,200")).toEqual({ ok: true, value: "1200" });
  });
  it("date: requires YYYY-MM-DD", () => {
    expect(validateFieldValue(def({ type: "date" }), "2026-07-01")).toEqual({ ok: true, value: "2026-07-01" });
    expect(validateFieldValue(def({ type: "date" }), "01/07/2026").ok).toBe(false);
  });
  it("select: value must be an option", () => {
    const d = def({ type: "select", options: ["Gold", "Silver"] });
    expect(validateFieldValue(d, "Gold").ok).toBe(true);
    expect(validateFieldValue(d, "Bronze").ok).toBe(false);
  });
  it("checkbox: normalizes truthy strings", () => {
    expect(validateFieldValue(def({ type: "checkbox" }), "yes").value).toBe("true");
    expect(validateFieldValue(def({ type: "checkbox" }), "no").value).toBe("false");
  });
});

describe("formatFieldValue + helpers", () => {
  it("renders checkbox and empties", () => {
    expect(formatFieldValue(def({ type: "checkbox" }), "true")).toBe("Yes");
    expect(formatFieldValue(def({ type: "text" }), "")).toBe("—");
    expect(formatFieldValue(def({ type: "text" }), "VIP")).toBe("VIP");
  });
  it("filters + headers by entity", () => {
    const defs = [def({ id: "a", entity: "customer", label: "Tier" }), def({ id: "b", entity: "vendor", label: "MSME" })];
    expect(fieldsForEntity(defs, "customer").map((d) => d.id)).toEqual(["a"]);
    expect(customFieldHeaders(defs, "customer")).toEqual(["Tier"]);
  });
});
