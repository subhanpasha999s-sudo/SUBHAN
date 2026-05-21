import type { MeeshoLabelRecord, PaymentKind } from "@/types/meesho-label-export";

export type AmazonPageType = "shipping_label" | "tax_invoice" | "unknown";

export interface AmazonTaxInvoicePage {
  marketplace: "amazon";
  fileType: "invoice";
  orderId: string;
  sku: string;
  quantity: number | null;
  invoiceNumber: string;
  invoiceDate: string;
  productName: string;
  rawPageIndex: number;
  importId?: string;
  sourceFile: string;
  matchStatus: "Shipping Label Missing";
}

export interface AmazonShippingPage {
  marketplace: "amazon";
  fileType: "shipping_label";
  orderId: string | null;
  awb: string | null;
  customerName: string | null;
  shippingAddress: string | null;
  courierPartner: string;
  payment: PaymentKind;
}

export type AmazonParsedPage =
  | { type: "shipping_label"; shipping: AmazonShippingPage }
  | { type: "tax_invoice"; invoice: AmazonTaxInvoicePage }
  | { type: "unknown" };

const ORDER_ID_PATTERN = `([0-9]{3}\\s*[-–—]\\s*[0-9]{7}\\s*[-–—]\\s*[0-9]{7})`;

function compactText(rawText: string): string {
  return rawText.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

export function normalizeAmazonOrderId(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, "").replace(/[–—]/g, "-").trim();
}

function shippingScore(t: string): number {
  let score = 0;
  if (/\bSold\s+on\s*:\s*www\s*\.?\s*amazon\s*\.?\s*in\b/i.test(t)) score += 4;
  if (new RegExp(`\\bOrder\\s+Id\\s*[:#-]?\\s*${ORDER_ID_PATTERN}\\b`, "i").test(t)) score += 3;
  if (/\bShip\s+To\b/i.test(t)) score += 2;
  if (/\bAWB\b/i.test(t)) score += 1;
  if (/\bPREPAID\b|\bCOD\b|\bCash\s+on\s+Delivery\b/i.test(t)) score += 1;
  if (/\bDelivery\s+Station\b|\bSort\s*Zone\b|\bSector\b/i.test(t)) score += 1;
  if (/\b(?:ATS|ATSPL|Delhivery|Shadowfax|Blue\s*Dart|BlueDart|Ecom|Xpressbees)\b/i.test(t)) score += 1;
  return score;
}

function invoiceScore(t: string): number {
  let score = 0;
  if (/\bTax\s+Invoice\/Bill\s+of\s+Supply(?:\/Cash\s+Memo)?\b/i.test(t)) score += 4;
  if (/\bOrder\s+Number\b/i.test(t)) score += 3;
  if (/\bInvoice\s+(?:Number|Details|Date)\b/i.test(t)) score += 2;
  if (/\bBilling\s+Address\b/i.test(t)) score += 1;
  if (/\bShipping\s+Address\b/i.test(t)) score += 1;
  if (/\bDescription\b/i.test(t) && /\bQty\b/i.test(t)) score += 1;
  if (/\(\s*[A-Za-z0-9][A-Za-z0-9._/-]{1,80}\s*\)\s*HSN\s*:/i.test(t)) score += 2;
  return score;
}

export function detectAmazonPageType(rawText: string): AmazonPageType {
  const t = compactText(rawText);
  const invoice = invoiceScore(t);
  const shipping = shippingScore(t);

  if (invoice >= 6 && invoice >= shipping) return "tax_invoice";
  if (shipping >= 6 && shipping > invoice) return "shipping_label";
  return "unknown";
}

export function extractAmazonOrderId(rawText: string): string | null {
  const t = compactText(rawText);
  const match =
    t.match(new RegExp(`\\bOrder\\s+Id\\s*[:#-]?\\s*${ORDER_ID_PATTERN}\\b`, "i")) ??
    t.match(new RegExp(`\\bOrder\\s+Number\\s*[:#-]?\\s*${ORDER_ID_PATTERN}\\b`, "i")) ??
    t.match(new RegExp(`\\b${ORDER_ID_PATTERN}\\b`, "i"));
  return normalizeAmazonOrderId(match?.[1] ?? null) || null;
}

function extractAmazonAwb(rawText: string): string | null {
  const t = compactText(rawText);
  const match = t.match(/\bAWB\s*[:#-]?\s*([A-Z0-9-]{6,})\b/i);
  return match?.[1]?.trim() ?? null;
}

function extractAmazonPayment(rawText: string): PaymentKind {
  const t = compactText(rawText);
  if (/\bCOD\b|\bCash\s+on\s+Delivery\b/i.test(t)) return "cod";
  if (/\bPREPAID\b|\bPre\s*Paid\b|\bPaid\s+Online\b|\bOnline\s+Payment\b|\bMode\s+of\s+Payment\s*:\s*(?:UPI|Card|Net\s*Banking)\b/i.test(t)) {
    return "prepaid";
  }
  return "unknown";
}

function normalizeCourier(value: string): string {
  const v = value.replace(/\s+/g, " ").trim();
  if (/^(?:ATS|ATSPL|Amazon\s+Transport(?:ation)?\s+Service(?:s)?)(?:\s+Pvt\.?\s+Ltd\.?)?$/i.test(v)) {
    return "Amazon Transport Service";
  }
  if (/^ASL$/i.test(v)) return "Amazon Transport Service";
  if (/^Blue\s*Dart$/i.test(v) || /^BlueDart$/i.test(v)) return "Blue Dart";
  if (/^Ecom(?:\s+Express)?$/i.test(v)) return "Ecom Express";
  return v;
}

function extractAmazonCourier(rawText: string): string {
  const t = compactText(rawText);
  const patterns = [
    /\bCourier\s*(?:Partner|Name)?\s*[:.-]?\s*([A-Za-z0-9&./ -]{2,60}?)(?=\s+(?:Tracking|AWB|Order|Ship|Payment|$))/i,
    /\bCarrier\s*[:.-]?\s*([A-Za-z0-9&./ -]{2,60}?)(?=\s+(?:Tracking|AWB|Order|Ship|Payment|$))/i,
    /\bShip(?:ped)?\s+by\s*[:.-]?\s*([A-Za-z0-9&./ -]{2,60}?)(?=\s+(?:Tracking|AWB|Order|Payment|$))/i,
  ];
  for (const pattern of patterns) {
    const match = t.match(pattern);
    const value = match?.[1]?.trim();
    if (value) return normalizeCourier(value);
  }

  const known = t.match(/\b(ATS|ATSPL|ASL|Amazon\s+Transport(?:ation)?\s+Service(?:s)?|Delhivery|Ecom\s+Express|Ecom|Xpressbees|Blue\s*Dart|BlueDart|Shadowfax)\b/i);
  return known?.[1] ? normalizeCourier(known[1]) : "Unknown";
}

function extractCustomerName(rawText: string): string | null {
  const t = compactText(rawText);
  const match = t.match(/\bShip\s+To\s*:\s*([A-Za-z][A-Za-z .'-]{2,80}?)(?=\s+[A-Z0-9,.'/-]{2,}|\s+Order\s+Id\b)/i);
  return match?.[1]?.trim() ?? null;
}

function extractShippingAddress(rawText: string): string | null {
  const t = compactText(rawText);
  const match = t.match(/\bShip\s+To\s*:\s*(.+?)(?=\s+Order\s+Id\b|\s+Ship\s+Date\b|\s+Sold\s+on\s*:)/i);
  return match?.[1]?.trim() ?? null;
}

function extractInvoiceNumber(rawText: string): string {
  const t = compactText(rawText);
  const match =
    t.match(/\bInvoice\s+Number\s*:\s*([A-Z0-9/_-]+)\b/i) ??
    t.match(/\bInvoice\s+Details\s*:\s*([A-Z0-9/_-]+)\b/i);
  return match?.[1]?.trim() || "Unknown";
}

function extractInvoiceDate(rawText: string): string {
  const t = compactText(rawText);
  const match = t.match(/\bInvoice\s+Date\s*:\s*([0-9./-]{6,12})\b/i);
  return match?.[1]?.trim() || "Unknown";
}

function extractProductName(rawText: string): string {
  const t = compactText(rawText);
  const match = t.match(/\bDescription\s+Unit\s+Price\s+Qty\b\s*(.+?)(?=\s*\(\s*[A-Za-z0-9][A-Za-z0-9._/-]{1,80}\s*\)\s*HSN\s*:|\s+HSN\s*:)/i);
  return match?.[1]?.trim() || "Unknown";
}

function extractSku(rawText: string): string {
  const t = compactText(rawText);
  const beforeHsn = t.match(/\(\s*([A-Za-z0-9][A-Za-z0-9._/-]{1,80})\s*\)\s*HSN\s*:/i);
  if (beforeHsn?.[1]) return beforeHsn[1].trim();

  const bracketed = [...t.matchAll(/\(\s*([A-Za-z0-9][A-Za-z0-9._/-]{1,80})\s*\)/g)]
    .map((m) => m[1]?.trim() ?? "")
    .filter((v) => /[-_/]/.test(v) && !/\s/.test(v));
  return bracketed[0] || "Unknown";
}

function extractQuantity(rawText: string): number | null {
  const t = compactText(rawText);
  const hsnUnitQtyNet = t.match(
    /\bHSN\s*:\s*\d+\s+(?:₹|Rs\.?|INR)?\s*[\d,.]+\s+(\d{1,4})\s+(?:₹|Rs\.?|INR)?\s*[\d,.]+/i
  );
  if (hsnUnitQtyNet?.[1]) {
    const n = Number.parseInt(hsnUnitQtyNet[1], 10);
    if (Number.isFinite(n)) return n;
  }

  const invoiceTableQty = t.match(
    /\bDescription\b.+?\bUnit\s+Price\b.+?\bQty\b.+?\bNet\s+Amount\b.+?\bHSN\s*:\s*\d+(.{0,180}?)(?:\bTOTAL\b|\bAmount\s+in\s+Words\b|$)/i
  );
  if (invoiceTableQty?.[1]) {
    const amountQtyAmount = invoiceTableQty[1].match(
      /(?:₹|Rs\.?|INR)?\s*[\d,.]+\s+(\d{1,4})\s+(?:₹|Rs\.?|INR)?\s*[\d,.]+/i
    );
    if (amountQtyAmount?.[1]) {
      const n = Number.parseInt(amountQtyAmount[1], 10);
      if (Number.isFinite(n)) return n;
    }
  }

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

  return null;
}

export function parseAmazonPage(
  rawText: string,
  rawPageIndex: number,
  sourceFile = ""
): AmazonParsedPage {
  const type = detectAmazonPageType(rawText);
  if (type === "shipping_label") {
    return {
      type,
      shipping: {
        marketplace: "amazon",
        fileType: "shipping_label",
        orderId: extractAmazonOrderId(rawText),
        awb: extractAmazonAwb(rawText),
        customerName: extractCustomerName(rawText),
        shippingAddress: extractShippingAddress(rawText),
        courierPartner: extractAmazonCourier(rawText),
        payment: extractAmazonPayment(rawText),
      },
    };
  }

  if (type === "tax_invoice") {
    const orderId = extractAmazonOrderId(rawText);
    if (!orderId) return { type: "unknown" };
    return {
      type,
      invoice: {
        marketplace: "amazon",
        fileType: "invoice",
        orderId,
        sku: extractSku(rawText),
        quantity: extractQuantity(rawText),
        invoiceNumber: extractInvoiceNumber(rawText),
        invoiceDate: extractInvoiceDate(rawText),
        productName: extractProductName(rawText),
        rawPageIndex,
        sourceFile,
        matchStatus: "Shipping Label Missing",
      },
    };
  }

  return { type: "unknown" };
}

export function pairAmazonShippingRows(
  rows: readonly MeeshoLabelRecord[],
  invoices: readonly AmazonTaxInvoicePage[]
): MeeshoLabelRecord[] {
  const invoiceByOrder = new Map<string, AmazonTaxInvoicePage>();
  for (const invoice of invoices) {
    const key = normalizeAmazonOrderId(invoice.orderId);
    if (key && !invoiceByOrder.has(key)) invoiceByOrder.set(key, invoice);
  }

  return rows.map((row) => {
    if (row.marketplace !== "amazon" || row.fileType !== "shipping_label") return row;
    const invoice = invoiceByOrder.get(normalizeAmazonOrderId(row.orderId));
    if (!invoice) {
      return {
        ...row,
        listing_sku: "",
        quantity: null,
        invoiceNumber: "",
        productName: "",
        matchStatus: "Invoice Missing",
      };
    }

    return {
      ...row,
      listing_sku: invoice.sku === "Unknown" ? "" : invoice.sku,
      quantity: invoice.quantity,
      invoiceNumber: invoice.invoiceNumber,
      invoiceDate: invoice.invoiceDate,
      productName: invoice.productName,
      matchStatus: "Matched",
    };
  });
}

export function formatAmazonSkuQtyOverlayText(
  skuValue: string,
  quantity: number | null
): string | undefined {
  const sku = skuValue.trim();
  if (!sku) return undefined;
  const qty = quantity == null ? "Unknown" : quantity.toLocaleString();
  return `SKU: ${sku} | QTY: ${qty}`;
}

export function amazonShippingOverlayText(row: MeeshoLabelRecord): string | undefined {
  if (row.marketplace !== "amazon" || row.fileType !== "shipping_label") return undefined;
  if (row.matchStatus !== "Matched") return undefined;
  return formatAmazonSkuQtyOverlayText(row.listing_sku, row.quantity);
}

export function containsAmazonRows(rows: readonly MeeshoLabelRecord[]): boolean {
  return rows.some((row) => row.marketplace === "amazon");
}
