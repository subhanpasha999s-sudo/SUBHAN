import type { TextContent } from "pdfjs-dist/types/src/display/api";

import {
  parseAmazonPage,
  type AmazonTaxInvoicePage,
} from "@/lib/amazon-label-engine";
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

export type PdfLabelParseStats = {
  pageCount: number;
  textPageCount: number;
  parsedLabelPageCount: number;
  parsedAmazonInvoicePageCount: number;
  unreadablePageCount: number;
  unrecognizedTextPageCount: number;
};

function emptyParseStats(): PdfLabelParseStats {
  return {
    pageCount: 0,
    textPageCount: 0,
    parsedLabelPageCount: 0,
    parsedAmazonInvoicePageCount: 0,
    unreadablePageCount: 0,
    unrecognizedTextPageCount: 0,
  };
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
  amazonInvoices: AmazonTaxInvoicePage[];
  stats: PdfLabelParseStats;
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
    const amazonInvoices: AmazonTaxInvoicePage[] = [];
    const stats: PdfLabelParseStats = { ...emptyParseStats(), pageCount };

    for (let page = 1; page <= pageCount; page++) {
      const pageObj = await pdfJsDoc.getPage(page);
      const tc = await pageObj.getTextContent();
      const rawText = textFromContent(tc);
      const normalizedText = rawText.replace(/\s+/g, " ").trim();
      if (normalizedText.length >= 12) stats.textPageCount += 1;

      const amazonPage = parseAmazonPage(rawText, page - 1);
      if (amazonPage.type === "tax_invoice") {
        amazonInvoices.push(amazonPage.invoice);
        stats.parsedAmazonInvoicePageCount += 1;
        await pageObj.cleanup();
        opts.onProgress?.(page, pageCount);
        await yieldForParsePolicy(page, policy);
        continue;
      }

      if (amazonPage.type === "shipping_label") {
        const amazonShipping = amazonPage.shipping;
        await pageObj.cleanup();
        stats.parsedLabelPageCount += 1;

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

      if (normalizedText.length < 12) {
        stats.unreadablePageCount += 1;
        await pageObj.cleanup();
        opts.onProgress?.(page, pageCount);
        await yieldForParsePolicy(page, policy);
        continue;
      }

      const extracted = extractMeeshoFields(rawText);
      await pageObj.cleanup();

      if (
        extracted.marketplace === "unknown" &&
        !extracted.sku &&
        extracted.qty == null &&
        extracted.partner === "Unknown" &&
        extracted.payment === "unknown"
      ) {
        stats.unrecognizedTextPageCount += 1;
        opts.onProgress?.(page, pageCount);
        await yieldForParsePolicy(page, policy);
        continue;
      }

      stats.parsedLabelPageCount += 1;
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
    return { rows, amazonInvoices, stats, pdfBytes };
  } catch (e) {
    const msg =
      e instanceof Error ? e.message : "Invalid or unreadable PDF.";
    return {
      rows: [],
      amazonInvoices: [],
      stats: emptyParseStats(),
      pdfBytes: new Uint8Array(),
      error: msg,
    };
  }
}
