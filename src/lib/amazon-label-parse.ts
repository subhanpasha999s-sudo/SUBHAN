import type { PaymentKind } from "@/types/meesho-label-export";

export interface AmazonInvoiceRecord {
  marketplace: "amazon";
  fileType: "invoice";
  orderId: string;
  sku: string;
  quantity: number | null;
  invoiceNumber: string;
  productName: string;
  rawPageIndex: number;
  importId?: string;
  sourceFile: string;
  matchStatus: "Shipping Label Missing";
}

export interface AmazonShippingFields {
  marketplace: "amazon";
  fileType: "shipping_label";
  orderId: string | null;
  awb: string | null;
  customerName: string | null;
  shippingAddress: string | null;
  courierPartner: string;
  payment: PaymentKind;
}

export function normalizeAmazonOrderId(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, "").replace(/[–—]/g, "-").trim();
}

export function isAmazonInvoiceText(rawText: string): boolean {
  const t = rawText.replace(/\s+/g, " ");
  let score = 0;
  if (/\bTax\s+Invoice\/Bill\s+of\s+Supply(?:\/Cash\s+Memo)?\b/i.test(t)) score += 3;
  if (/\bBilling\s+Address\b/i.test(t)) score += 1;
  if (/\bShipping\s+Address\b/i.test(t)) score += 1;
  if (/\bOrder\s+Number\b/i.test(t)) score += 2;
  if (/\bInvoice\s+(?:Number|Details)\b/i.test(t)) score += 2;
  if (/\bHSN\s*:\s*\d+/i.test(t)) score += 1;
  if (/\bQty\b/i.test(t)) score += 1;
  return score >= 5;
}

export function isAmazonShippingLabelText(rawText: string): boolean {
  const t = rawText.replace(/\s+/g, " ");
  const hasAmazonFooter = /\bSold\s+on\s*:\s*www\s*\.?\s*amazon\s*\.?\s*in\b/i.test(t);
  const hasAmazonOrderId = /\bOrder\s+Id\s*[:#-]?\s*[0-9]{3}\s*[-–—]\s*[0-9]{7}\s*[-–—]\s*[0-9]{7}\b/i.test(t);
  let score = 0;
  if (hasAmazonFooter) score += 3;
  if (/\bOrder\s+Id\b/i.test(t)) score += 2;
  if (/\bShip\s+To\b/i.test(t)) score += 1;
  if (/\bAWB\b/i.test(t)) score += 1;
  if (/\bPREPAID\b|\bCOD\b/i.test(t)) score += 1;
  if (/\bDelivery\s+Station\b|\bSort\s*Zone\b|\bSector\b/i.test(t)) score += 1;
  if (/\b(?:ATS|ATSPL|Delhivery|Shadowfax|Blue\s*Dart|Ecom)\b/i.test(t)) score += 1;
  return hasAmazonFooter || (hasAmazonOrderId && score >= 5);
}

export function resolveAmazonPayment(rawText: string): PaymentKind {
  const t = rawText.replace(/\s+/g, " ");
  return (
    /\bCOD\b|\bCash\s+on\s+Delivery\b/i.test(t)
  )
    ? "cod"
    : /\bPREPAID\b|\bPre\s*Paid\b|\bPaid\s+Online\b|\bOnline\s+Payment\b|\bMode\s+of\s+Payment\s*:\s*(?:UPI|Card|Net\s*Banking)\b/i.test(t)
      ? "prepaid"
      : "unknown";
}

export function resolveAmazonAwb(rawText: string): string | null {
  const t = rawText.replace(/\s+/g, " ");
  const match = t.match(/\bAWB\s*[:#-]?\s*([A-Z0-9-]{6,})\b/i);
  return match?.[1]?.trim() ?? null;
}

export function resolveAmazonCustomerName(rawText: string): string | null {
  const t = rawText.replace(/\s+/g, " ");
  const match = t.match(/\bShip\s+To\s*:\s*([A-Za-z][A-Za-z .'-]{2,80}?)(?=\s+[A-Z][A-Za-z .'-]{2,80}\s+(?:[A-Z0-9,.-]+\s+){1,8}|\s+\d{6}\b|\s+Order\s+Id\b)/i);
  const value = match?.[1]?.replace(/\s+/g, " ").trim();
  return value || null;
}

export function resolveAmazonShippingAddress(rawText: string): string | null {
  const t = rawText.replace(/\s+/g, " ");
  const match = t.match(/\bShip\s+To\s*:\s*(.+?)(?=\s+Order\s+Id\b|\s+Ship\s+Date\b|\s+AWB\b|\s+Sold\s+on:\s*www\.amazon\.in\b)/i);
  const value = match?.[1]?.replace(/\s+/g, " ").trim();
  return value || null;
}

export function resolveAmazonInvoiceNumber(rawText: string): string | null {
  const t = rawText.replace(/\s+/g, " ");
  const match =
    t.match(/\bInvoice\s+Number\s*:\s*([A-Z0-9/_-]+)\b/i) ??
    t.match(/\bInvoice\s+Details\s*:\s*([A-Z0-9/_-]+)\b/i);
  return match?.[1]?.trim() ?? null;
}

export function resolveAmazonProductName(rawText: string): string | null {
  const t = rawText.replace(/\s+/g, " ");
  const match = t.match(/\bDescription\s+Unit\s+Price\s+Qty\b\s*(.+?)(?=\s*\(\s*[A-Za-z0-9][A-Za-z0-9._/-]{1,80}\s*\)\s*HSN\s*:|\s+HSN\s*:)/i);
  const value = match?.[1]?.replace(/\s+/g, " ").trim();
  return value || null;
}

export function resolveAmazonInvoiceQuantity(rawText: string): number | null {
  const t = rawText.replace(/\s+/g, " ");
  const hsnQtyPrice = t.match(/\bHSN\s*:\s*\d+\s+(\d{1,4})\s*[₹Rs. ]?\d/i);
  if (hsnQtyPrice?.[1]) {
    const n = Number.parseInt(hsnQtyPrice[1], 10);
    if (Number.isFinite(n)) return n;
  }

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

export function resolveAmazonInvoiceSku(rawText: string): string | null {
  const t = rawText.replace(/\s+/g, " ");
  const beforeHsn = t.match(/\(\s*([A-Za-z0-9][A-Za-z0-9._/-]{1,80})\s*\)\s*HSN\s*:/i);
  if (beforeHsn?.[1]) return beforeHsn[1].trim();

  const bracketed = [...t.matchAll(/\(\s*([A-Za-z0-9][A-Za-z0-9._/-]{1,80})\s*\)/g)]
    .map((m) => m[1]?.trim() ?? "")
    .filter((v) => /[-_/]/.test(v) && !/\s/.test(v));
  return bracketed[0] || null;
}

export function resolveAmazonOrderId(rawText: string): string | null {
  const t = rawText.replace(/\s+/g, " ");
  const orderPattern = `([0-9]{3}\\s*[-–—]\\s*[0-9]{7}\\s*[-–—]\\s*[0-9]{7})`;
  const match =
    t.match(new RegExp(`\\bOrder\\s+Id\\s*[:#-]?\\s*${orderPattern}\\b`, "i")) ??
    t.match(new RegExp(`\\bOrder\\s+Number\\s*[:#-]?\\s*${orderPattern}\\b`, "i")) ??
    t.match(new RegExp(`\\b${orderPattern}\\b`, "i"));
  return normalizeAmazonOrderId(match?.[1] ?? null) || null;
}

export function resolveAmazonCourier(rawText: string): string {
  const t = rawText.replace(/\s+/g, " ").trim();
  const normalizeCourier = (value: string): string => {
    const v = value.replace(/\s+/g, " ").trim();
    if (/^(?:ATS|ATSPL|Amazon\s+Transport(?:ation)?\s+Service(?:s)?)(?:\s+Pvt\.?\s+Ltd\.?)?$/i.test(v)) {
      return "Amazon Transport Service";
    }
    if (/^Blue\s*Dart$/i.test(v) || /^BlueDart$/i.test(v)) return "Blue Dart";
    if (/^Ecom(?:\s+Express)?$/i.test(v)) return "Ecom Express";
    return v;
  };

  const patterns = [
    /\bCourier\s*(?:Partner|Name)?\s*[:.-]?\s*([A-Za-z0-9&./ -]{2,60}?)(?=\s+(?:Tracking|AWB|Order|Ship|Payment|$))/i,
    /\bCarrier\s*[:.-]?\s*([A-Za-z0-9&./ -]{2,60}?)(?=\s+(?:Tracking|AWB|Order|Ship|Payment|$))/i,
    /\bShip(?:ped)?\s+by\s*[:.-]?\s*([A-Za-z0-9&./ -]{2,60}?)(?=\s+(?:Tracking|AWB|Order|Payment|$))/i,
  ];
  for (const pattern of patterns) {
    const match = t.match(pattern);
    const value = match?.[1]?.replace(/\s+/g, " ").trim();
    if (value) return normalizeCourier(value);
  }

  const known = t.match(/\b(ATS|ATSPL|Amazon\s+Transport(?:ation)?\s+Service(?:s)?|Delhivery|Ecom\s+Express|Ecom|Xpressbees|Blue\s*Dart|BlueDart|Shadowfax)\b/i);
  return known?.[1] ? normalizeCourier(known[1]) : "Unknown";
}

export function extractAmazonShippingFields(rawText: string): AmazonShippingFields | null {
  if (!isAmazonShippingLabelText(rawText)) return null;
  return {
    marketplace: "amazon",
    fileType: "shipping_label",
    orderId: resolveAmazonOrderId(rawText),
    awb: resolveAmazonAwb(rawText),
    customerName: resolveAmazonCustomerName(rawText),
    shippingAddress: resolveAmazonShippingAddress(rawText),
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
    invoiceNumber: resolveAmazonInvoiceNumber(rawText) ?? "Unknown",
    productName: resolveAmazonProductName(rawText) ?? "Unknown",
    rawPageIndex,
    sourceFile,
    matchStatus: "Shipping Label Missing",
  };
}
