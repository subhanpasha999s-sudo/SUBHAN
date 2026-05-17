import type { TextContent } from "pdfjs-dist/types/src/display/api";

import {
  extractAmazonInvoiceFields,
  extractAmazonShippingFields,
  type AmazonInvoiceRecord,
} from "@/lib/amazon-label-parse";
import { extractMeeshoFields } from "@/lib/meesho-parse";
import { loadPdfJsDocument } from "@/lib/pdf/configure-pdfjs";
import type { PdfParseYieldPolicy } from "@/lib/runtime/performance-tier";
import type { MeeshoLabelRecord } from "@/types/meesho-label-export";
import { yieldToIdle, yieldToMain } from "@/lib/yield-ui";

async function yieldForParsePolicy(page: number, policy: PdfParseYieldPolicy): Promise<void> {
  switch (policy) {
    case "throughput":
      /** Fewer yields on strong HW; keep first / last pages + periodic breathers. */
      if (page === 1 || page % 4 === 0) await yieldToMain();
      if (page % 14 === 0) await yieldToIdle();
      break;
    case "balanced":
      await yieldToMain();
      if (page % 2 === 0) await yieldToIdle();
      break;
    case "responsive":
    default:
      await yieldToMain();
      await yieldToIdle();
      break;
  }
}

function textFromContent(items: TextContent): string {
  let out = "";
  for (const it of items.items) {
    if ("str" in it && typeof it.str === "string") out += `${it.str} `;
  }
  return out;
}

/**
 * Core Meesho label PDF text extraction (+ field parsing).
 * Runs on the main thread (fallback) or inside `meesho-label-parse.worker`.
 */
export async function parseMeeshoLabelPdfFromBytes(opts: {
  pdfBytes: Uint8Array;
  onProgress?: (done: number, total: number) => void;
  /** Schedules cooperative yields — weak devices stay responsive on main-thread fallback. */
  yieldPolicy?: PdfParseYieldPolicy;
}): Promise<{
  rows: MeeshoLabelRecord[];
  amazonInvoices: AmazonInvoiceRecord[];
  pdfBytes: Uint8Array;
  error?: string;
}> {
  try {
    const policy = opts.yieldPolicy ?? "balanced";
    const pdfBytes = new Uint8Array(opts.pdfBytes.length);
    pdfBytes.set(opts.pdfBytes);
    const pdfJsDoc = await loadPdfJsDocument(pdfBytes);
    const pageCount = pdfJsDoc.numPages;
    const rows: MeeshoLabelRecord[] = [];
    const amazonInvoices: AmazonInvoiceRecord[] = [];

    for (let page = 1; page <= pageCount; page++) {
      const pageObj = await pdfJsDoc.getPage(page);
      const tc = await pageObj.getTextContent();
      const rawText = textFromContent(tc);
      const amazonInvoice = extractAmazonInvoiceFields(rawText, page - 1);
      if (amazonInvoice) {
        amazonInvoices.push(amazonInvoice);
        await pageObj.cleanup();
        opts.onProgress?.(page, pageCount);
        await yieldForParsePolicy(page, policy);
        continue;
      }

      const amazonShipping = extractAmazonShippingFields(rawText);
      if (amazonShipping) {
        await pageObj.cleanup();

        rows.push({
          id: `label-${page}`,
          listing_sku: "",
          quantity: null,
          delivery_partner: amazonShipping.courierPartner,
          marketplace: "amazon",
          payment: amazonShipping.payment,
          fileType: "shipping_label",
          orderId: amazonShipping.orderId ?? "",
          awb: amazonShipping.awb ?? "",
          customerName: amazonShipping.customerName ?? "",
          shippingAddress: amazonShipping.shippingAddress ?? "",
          matchStatus: amazonShipping.orderId ? "Invoice Missing" : "Invoice Missing",
          page,
          rawPageIndex: page - 1,
          importId: "",
          sourceFile: "",
        });

        opts.onProgress?.(page, pageCount);
        await yieldForParsePolicy(page, policy);
        continue;
      }

      const extracted = extractMeeshoFields(rawText);
      await pageObj.cleanup();

      rows.push({
        id: `label-${page}`,
        listing_sku: extracted.sku?.trim() ?? "",
        quantity: extracted.qty,
        delivery_partner: extracted.partner,
        marketplace: extracted.marketplace,
        payment: extracted.payment,
        fileType: "label",
        matchStatus: "Not Required",
        page,
        rawPageIndex: page - 1,
        importId: "",
        sourceFile: "",
      });

      opts.onProgress?.(page, pageCount);
      await yieldForParsePolicy(page, policy);
    }

    await pdfJsDoc.destroy();
    return { rows, amazonInvoices, pdfBytes };
  } catch (e) {
    const msg =
      e instanceof Error ? e.message : "Invalid or unreadable PDF.";
    return {
      rows: [],
      amazonInvoices: [],
      pdfBytes: new Uint8Array(),
      error: msg,
    };
  }
}
