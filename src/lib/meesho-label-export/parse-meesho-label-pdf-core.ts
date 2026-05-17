import type { PDFPageProxy, TextContent } from "pdfjs-dist/types/src/display/api";

import {
  parseAmazonPage,
  type AmazonParsedPage,
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
  ocrPageCount: number;
};

function emptyParseStats(): PdfLabelParseStats {
  return {
    pageCount: 0,
    textPageCount: 0,
    parsedLabelPageCount: 0,
    parsedAmazonInvoicePageCount: 0,
    unreadablePageCount: 0,
    unrecognizedTextPageCount: 0,
    ocrPageCount: 0,
  };
}

function addAmazonParsedPage(opts: {
  amazonPage: AmazonParsedPage;
  page: number;
  rows: MeeshoLabelRecord[];
  amazonInvoices: AmazonTaxInvoicePage[];
  stats: PdfLabelParseStats;
}): boolean {
  const { amazonPage, page, rows, amazonInvoices, stats } = opts;
  if (amazonPage.type === "tax_invoice") {
    amazonInvoices.push(amazonPage.invoice);
    stats.parsedAmazonInvoicePageCount += 1;
    return true;
  }

  if (amazonPage.type === "shipping_label") {
    const amazonShipping = amazonPage.shipping;
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
      matchStatus: "Invoice Missing",
      page,
      rawPageIndex: page - 1,
      importId: "",
      sourceFile: "",
    });
    return true;
  }

  return false;
}

async function renderPdfPageForOcr(pageObj: PDFPageProxy): Promise<string | null> {
  if (typeof document === "undefined") return null;
  const viewport = pageObj.getViewport({ scale: 2.2 });
  const canvas = document.createElement("canvas");
  const width = Math.ceil(viewport.width);
  const height = Math.ceil(viewport.height);
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) return null;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, width, height);
  await pageObj.render({ canvasContext: ctx, viewport, canvas }).promise;
  return canvas.toDataURL("image/png");
}

async function recognizePdfPageText(pageObj: PDFPageProxy): Promise<string> {
  const image = await renderPdfPageForOcr(pageObj);
  if (!image) return "";
  const Tesseract = (await import("tesseract.js")).default;
  const result = await Tesseract.recognize(image, "eng", {
    workerPath: "/ocr/worker.min.js",
    langPath: "/ocr",
    corePath: "/ocr/tesseract-core",
  });
  return result.data.text;
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
  /** Slow fallback for image-only Amazon pages. Available on the browser main thread. */
  enableOcrFallback?: boolean;
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
      if (addAmazonParsedPage({ amazonPage, page, rows, amazonInvoices, stats })) {
        await pageObj.cleanup();
        opts.onProgress?.(page, pageCount);
        await yieldForParsePolicy(page, policy);
        continue;
      }

      if (normalizedText.length < 12) {
        if (opts.enableOcrFallback) {
          const ocrText = await recognizePdfPageText(pageObj);
          const normalizedOcrText = ocrText.replace(/\s+/g, " ").trim();
          if (normalizedOcrText.length >= 12) {
            stats.ocrPageCount += 1;
            const ocrAmazonPage = parseAmazonPage(ocrText, page - 1);
            if (
              addAmazonParsedPage({
                amazonPage: ocrAmazonPage,
                page,
                rows,
                amazonInvoices,
                stats,
              })
            ) {
              await pageObj.cleanup();
              opts.onProgress?.(page, pageCount);
              await yieldForParsePolicy(page, policy);
              continue;
            }
            stats.unrecognizedTextPageCount += 1;
          }
        }

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
