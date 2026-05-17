import type { PaymentKind } from "@/types/meesho-label-export";

export interface AmazonInvoiceRecord {
  marketplace: "amazon";
  fileType: "invoice";
  orderId: string;
  sku: string;
  quantity: number | null;
  rawPageIndex: number;
  sourceFile: string;
  matchStatus: "Shipping Label Missing";
}

export interface AmazonShippingFields {
  marketplace: "amazon";
  fileType: "shipping_label";
  orderId: string | null;
  courierPartner: string;
  payment: PaymentKind;
}

export function normalizeAmazonOrderId(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, "").trim();
}

export function isAmazonInvoiceText(rawText: string): boolean {
  const t = rawText.replace(/\s+/g, " ");
  return (
    /\bTax\s+Invoice\/Bill\s+of\s+Supply\/Cash\s+Memo\b/i.test(t) &&
    /\bOrder\s+Number\b/i.test(t) &&
    /\bInvoice\s+Number\b/i.test(t)
  );
}

export function isAmazonShippingLabelText(rawText: string): boolean {
  const t = rawText.replace(/\s+/g, " ");
  return (
    /\bSold\s+on:\s*www\.amazon\.in\b/i.test(t) ||
    (/\bOrder\s+Id\b/i.test(t) && /\bamazon\b/i.test(t))
  );
}

export function resolveAmazonPayment(rawText: string): PaymentKind {
  const t = rawText.replace(/\s+/g, " ");
  if (/\bCOD\b|\bCash\s+on\s+Delivery\b/i.test(t)) return "cod";
  if (/\bPREPAID\b|\bPre\s*Paid\b|\bPaid\s+Online\b|\bOnline\s+Payment\b/i.test(t)) {
    return "prepaid";
  }
  return "unknown";
}

export function resolveAmazonOrderId(rawText: string): string | null {
  const t = rawText.replace(/\s+/g, " ");
  const match =
    t.match(/\bOrder\s+Id\s*[:#-]?\s*([0-9]{3}-[0-9]{7}-[0-9]{7})\b/i) ??
    t.match(/\bOrder\s+Number\s*[:#-]?\s*([0-9]{3}-[0-9]{7}-[0-9]{7})\b/i);
  return normalizeAmazonOrderId(match?.[1] ?? null) || null;
}

export function resolveAmazonInvoiceSku(rawText: string): string | null {
  const t = rawText.replace(/\s+/g, " ");
  const beforeHsn = t.match(/\(\s*([A-Za-z0-9][A-Za-z0-9._/-]{1,80})\s*\)\s*HSN\s*:/i);
  if (beforeHsn?.[1]) return beforeHsn[1].trim();

  const bracketed = [...t.matchAll(/\(\s*([A-Za-z0-9][A-Za-z0-9._/-]{1,80})\s*\)/g)]
    .map((m) => m[1]?.trim() ?? "")
    .filter((v) => /[-_/]/.test(v) && !/\s/.test(v));
  return bracketed[0] || null;
}

export function resolveAmazonInvoiceQuantity(rawText: string): number | null {
  const t = rawText.replace(/\s+/g, " ");
  const qtyNearLabel =
    t.match(/\bQty\b\s*[:.-]?\s*(\d{1,4})\b/i) ??
    t.match(/\bQuantity\b\s*[:.-]?\s*(\d{1,4})\b/i);
  if (qtyNearLabel?.[1]) {
    const n = Number.parseInt(qtyNearLabel[1], 10);
    if (Number.isFinite(n)) return n;
  }

  const afterHsn = t.match(/\bHSN\s*:\s*\d+\s+(\d{1,4})\b/i);
  if (afterHsn?.[1]) {
    const n = Number.parseInt(afterHsn[1], 10);
    if (Number.isFinite(n)) return n;
  }

  return null;
}

export function resolveAmazonCourier(rawText: string): string {
  const t = rawText.replace(/\s+/g, " ").trim();
  const patterns = [
    /\bCourier\s*(?:Partner|Name)?\s*[:.-]?\s*([A-Za-z0-9&./ -]{2,60}?)(?=\s+(?:Tracking|AWB|Order|Ship|Payment|$))/i,
    /\bCarrier\s*[:.-]?\s*([A-Za-z0-9&./ -]{2,60}?)(?=\s+(?:Tracking|AWB|Order|Ship|Payment|$))/i,
    /\bShip(?:ped)?\s+by\s*[:.-]?\s*([A-Za-z0-9&./ -]{2,60}?)(?=\s+(?:Tracking|AWB|Order|Payment|$))/i,
  ];
  for (const pattern of patterns) {
    const match = t.match(pattern);
    const value = match?.[1]?.replace(/\s+/g, " ").trim();
    if (value) return value;
  }

  const known = t.match(/\b(ATSPL|Amazon\s+Transportation\s+Services|Delhivery|Ecom\s+Express|Xpressbees|Blue\s+Dart|Shadowfax)\b/i);
  return known?.[1]?.replace(/\s+/g, " ").trim() || "Unknown";
}

export function extractAmazonShippingFields(rawText: string): AmazonShippingFields | null {
  if (!isAmazonShippingLabelText(rawText)) return null;
  return {
    marketplace: "amazon",
    fileType: "shipping_label",
    orderId: resolveAmazonOrderId(rawText),
    courierPartner: resolveAmazonCourier(rawText),
    payment: resolveAmazonPayment(rawText),
  };
}

export function extractAmazonInvoiceFields(
  rawText: string,
  rawPageIndex: number,
  sourceFile = ""
): AmazonInvoiceRecord | null {
  if (!isAmazonInvoiceText(rawText)) return null;
  const orderId = resolveAmazonOrderId(rawText);
  if (!orderId) return null;
  return {
    marketplace: "amazon",
    fileType: "invoice",
    orderId,
    sku: resolveAmazonInvoiceSku(rawText) ?? "Unknown",
    quantity: resolveAmazonInvoiceQuantity(rawText),
    rawPageIndex,
    sourceFile,
    matchStatus: "Shipping Label Missing",
  };
}
