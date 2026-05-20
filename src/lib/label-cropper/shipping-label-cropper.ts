"use client";

import type { PDFDocumentProxy } from "pdfjs-dist";
import type { TextContent } from "pdfjs-dist/types/src/display/api";

import {
  normalizeAmazonOrderId,
  parseAmazonPage,
} from "@/lib/amazon-label-engine";
import { extractMeeshoFields } from "@/lib/meesho-parse";
import { loadPdfJsDocument } from "@/lib/pdf/configure-pdfjs";

export type CropperMarketplace = "auto" | "meesho" | "flipkart" | "amazon";
export type ResolvedCropperMarketplace = Exclude<CropperMarketplace, "auto"> | "unknown";
export type CropperPageKind = "shipping" | "invoice" | "combined" | "unknown";
export type CropMode = "shipping" | "invoice" | "both" | "full";

export type CropRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type CropperPage = {
  pageIndex: number;
  pageNumber: number;
  width: number;
  height: number;
  text: string;
  marketplace: ResolvedCropperMarketplace;
  kind: CropperPageKind;
  orderId: string;
  sku: string;
  quantity: number | null;
  awb: string;
  courier: string;
  defaultShippingRect: CropRect;
  defaultInvoiceRect: CropRect;
  defaultFullRect: CropRect;
  pairedInvoicePageIndex?: number;
  pairedShippingPageIndex?: number;
};

export type CropperDocument = {
  id: string;
  fileName: string;
  bytes: Uint8Array;
  pageCount: number;
  pages: CropperPage[];
};

export type CropExportEntry = {
  doc: CropperDocument;
  pageIndex: number;
  rect: CropRect;
  fileName: string;
};

type PositionedTextItem = {
  text: string;
  top: number;
};

const FULL_RECT: CropRect = { x: 0, y: 0, width: 1, height: 1 };
const MEESHO_SHIPPING_RECT: CropRect = { x: 0.015, y: 0.01, width: 0.97, height: 0.58 };
const MEESHO_INVOICE_RECT: CropRect = { x: 0.015, y: 0.58, width: 0.97, height: 0.41 };
const FLIPKART_LABEL_X = 0.05;
const FLIPKART_LABEL_WIDTH = 0.9;
const FLIPKART_SHIPPING_RECT: CropRect = {
  x: FLIPKART_LABEL_X,
  y: 0.005,
  width: FLIPKART_LABEL_WIDTH,
  height: 0.78,
};
const FLIPKART_INVOICE_RECT: CropRect = {
  x: FLIPKART_LABEL_X,
  y: 0.78,
  width: FLIPKART_LABEL_WIDTH,
  height: 0.215,
};

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

export function clampCropRect(rect: CropRect): CropRect {
  const width = Math.max(0.08, Math.min(1, rect.width));
  const height = Math.max(0.08, Math.min(1, rect.height));
  const x = clamp01(Math.min(rect.x, 1 - width));
  const y = clamp01(Math.min(rect.y, 1 - height));
  return { x, y, width, height };
}

function textFromItems(textContent: TextContent) {
  let out = "";
  for (const item of textContent.items) {
    if (item && typeof item === "object" && "str" in item && typeof item.str === "string") {
      out += `${item.str} `;
    }
  }
  return out;
}

function positionedTextItems(textContent: TextContent, pageHeight: number): PositionedTextItem[] {
  const out: PositionedTextItem[] = [];
  for (const item of textContent.items) {
    if (!item || typeof item !== "object" || !("str" in item) || typeof item.str !== "string") {
      continue;
    }
    if (!("transform" in item) || !Array.isArray(item.transform)) continue;
    const y = Number(item.transform[5]);
    if (!Number.isFinite(y) || pageHeight <= 0) continue;
    out.push({
      text: item.str,
      top: clamp01(1 - y / pageHeight),
    });
  }
  return out;
}

function invoiceBoundaryFromText(items: readonly PositionedTextItem[]): number | null {
  const normalizedItems = items.map((item) => ({
    ...item,
    normalized: item.text.replace(/\s+/g, " ").trim().toLowerCase(),
  }));
  const strongMarkers = normalizedItems
    .filter((item) =>
      /\btax\s*invoice\b/.test(item.normalized) ||
      /\binvoice\s*(no|number|date)\b/.test(item.normalized) ||
      /\btaxable\s+value\b/.test(item.normalized) ||
      /\bhsn\b/.test(item.normalized)
    )
    .map((item) => item.top)
    .filter((top) => top > 0.18 && top < 0.95)
    .sort((a, b) => a - b);
  if (strongMarkers.length > 0) return strongMarkers[0];

  const invoiceWordMarkers = normalizedItems
    .filter((item) => item.normalized === "tax" || item.normalized === "invoice")
    .map((item) => item.top)
    .filter((top) => top > 0.18 && top < 0.95)
    .sort((a, b) => a - b);
  for (let i = 0; i < invoiceWordMarkers.length - 1; i++) {
    if (Math.abs(invoiceWordMarkers[i] - invoiceWordMarkers[i + 1]) < 0.025) {
      return Math.min(invoiceWordMarkers[i], invoiceWordMarkers[i + 1]);
    }
  }
  return null;
}

function rectsSplitAtInvoice(
  rects: ReturnType<typeof defaultRects>,
  items: readonly PositionedTextItem[]
) {
  const boundary = invoiceBoundaryFromText(items);
  if (boundary == null) return rects;
  const safeBoundary = Math.max(0.28, Math.min(0.88, boundary - 0.012));
  const shipping = clampCropRect({
    ...rects.shipping,
    height: safeBoundary - rects.shipping.y,
  });
  const invoiceY = Math.min(0.96, safeBoundary + 0.006);
  const invoice = clampCropRect({
    ...rects.invoice,
    y: invoiceY,
    height: 1 - invoiceY - 0.005,
  });
  return { ...rects, shipping, invoice };
}

async function renderedLabelBounds(page: Awaited<ReturnType<PDFDocumentProxy["getPage"]>>): Promise<CropRect | null> {
  const viewport = page.getViewport({ scale: 2 });
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) return null;

  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: ctx, viewport, canvas }).promise;

  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const columnCurrentRuns = new Uint16Array(canvas.width);
  const columnMaxRuns = new Uint16Array(canvas.width);
  const rowMaxRuns = new Uint16Array(canvas.height);
  const scanHeight = Math.floor(canvas.height * 0.94);
  for (let y = 0; y < scanHeight; y++) {
    let rowCurrentRun = 0;
    for (let x = 0; x < canvas.width; x++) {
      const idx = (y * canvas.width + x) * 4;
      const red = data[idx] ?? 255;
      const green = data[idx + 1] ?? 255;
      const blue = data[idx + 2] ?? 255;
      if (red < 220 && green < 220 && blue < 220) {
        rowCurrentRun += 1;
        columnCurrentRuns[x] += 1;
        rowMaxRuns[y] = Math.max(rowMaxRuns[y] ?? 0, rowCurrentRun);
        columnMaxRuns[x] = Math.max(columnMaxRuns[x] ?? 0, columnCurrentRuns[x] ?? 0);
      } else {
        rowCurrentRun = 0;
        columnCurrentRuns[x] = 0;
      }
    }
  }

  const findRuns = (counts: Uint16Array, threshold: number, minLength: number) => {
    const runs: { start: number; end: number; peak: number }[] = [];
    let start = -1;
    let peak = 0;
    for (let i = 0; i < counts.length; i++) {
      if (counts[i] >= threshold) {
        if (start < 0) start = i;
        peak = Math.max(peak, counts[i] ?? 0);
      } else if (start >= 0) {
        if (i - start >= minLength) runs.push({ start, end: i - 1, peak });
        start = -1;
        peak = 0;
      }
    }
    if (start >= 0 && counts.length - start >= minLength) {
      runs.push({ start, end: counts.length - 1, peak });
    }
    return runs;
  };

  const verticalRuns = findRuns(
    columnMaxRuns,
    Math.max(40, Math.floor(canvas.height * 0.06)),
    Math.max(1, Math.floor(canvas.width * 0.001))
  );
  const horizontalRuns = findRuns(
    rowMaxRuns,
    Math.max(40, Math.floor(canvas.width * 0.25)),
    Math.max(1, Math.floor(canvas.height * 0.001))
  );

  const leftRun = verticalRuns.find((run) => run.start > canvas.width * 0.02);
  const rightRun = [...verticalRuns].reverse().find((run) => run.end < canvas.width * 0.98);
  const topRun = horizontalRuns.find((run) => run.start > canvas.height * 0.005);
  const bottomRun = [...horizontalRuns]
    .reverse()
    .find((run) => run.end < canvas.height * 0.94 && run.start - (topRun?.start ?? 0) > canvas.height * 0.35);

  if (!leftRun || !rightRun || !topRun || !bottomRun) return null;
  const minX = Math.floor((leftRun.start + leftRun.end) / 2);
  const maxX = Math.ceil((rightRun.start + rightRun.end) / 2);
  const minY = Math.floor((topRun.start + topRun.end) / 2);
  const maxY = Math.ceil((bottomRun.start + bottomRun.end) / 2);
  if (maxX <= minX || maxY <= minY) return null;

  const safePadding = 6;
  const padX = safePadding / canvas.width;
  const padY = safePadding / canvas.height;
  return clampCropRect({
    x: minX / canvas.width - padX,
    y: minY / canvas.height - padY,
    width: (maxX - minX + 1) / canvas.width + padX * 2,
    height: (maxY - minY + 1) / canvas.height + padY * 2,
  });
}

function applyLabelBounds(rects: ReturnType<typeof defaultRects>, bounds: CropRect | null) {
  if (!bounds) return rects;
  return {
    ...rects,
    shipping: bounds,
    invoice: clampCropRect({
      ...rects.invoice,
      x: bounds.x,
      width: bounds.width,
    }),
    full: bounds,
  };
}

function detectMarketplace(rawText: string): ResolvedCropperMarketplace {
  const t = rawText.replace(/\s+/g, " ");
  const amazon = parseAmazonPage(rawText, 0);
  if (amazon.type !== "unknown" || /\bamazon\b/i.test(t)) return "amazon";
  const extracted = extractMeeshoFields(rawText);
  if (extracted.marketplace === "meesho") return "meesho";
  if (extracted.marketplace === "flipkart") return "flipkart";
  if (/\bE-?Kart\b|\bFlipkart\b|\bSKU\s+ID\b/i.test(t)) return "flipkart";
  if (/\bMeesho\b|\bSub\s*Order\b|\bSupplier\b/i.test(t)) return "meesho";
  return "unknown";
}

function defaultRects(marketplace: ResolvedCropperMarketplace) {
  if (marketplace === "flipkart") {
    return {
      shipping: FLIPKART_SHIPPING_RECT,
      invoice: FLIPKART_INVOICE_RECT,
      full: FULL_RECT,
    };
  }
  if (marketplace === "amazon") {
    return { shipping: FULL_RECT, invoice: FULL_RECT, full: FULL_RECT };
  }
  return {
    shipping: MEESHO_SHIPPING_RECT,
    invoice: MEESHO_INVOICE_RECT,
    full: FULL_RECT,
  };
}

function analyzePageText(
  rawText: string,
  pageIndex: number,
  positionedItems: readonly PositionedTextItem[] = [],
  contentBounds: CropRect | null = null
): Omit<CropperPage, "width" | "height"> {
  const amazonPage = parseAmazonPage(rawText, pageIndex);
  if (amazonPage.type === "shipping_label") {
    const rects = defaultRects("amazon");
    return {
      pageIndex,
      pageNumber: pageIndex + 1,
      text: rawText,
      marketplace: "amazon",
      kind: "shipping",
      orderId: normalizeAmazonOrderId(amazonPage.shipping.orderId),
      sku: "",
      quantity: null,
      awb: amazonPage.shipping.awb ?? "",
      courier: amazonPage.shipping.courierPartner,
      defaultShippingRect: rects.shipping,
      defaultInvoiceRect: rects.invoice,
      defaultFullRect: rects.full,
    };
  }
  if (amazonPage.type === "tax_invoice") {
    const rects = defaultRects("amazon");
    return {
      pageIndex,
      pageNumber: pageIndex + 1,
      text: rawText,
      marketplace: "amazon",
      kind: "invoice",
      orderId: normalizeAmazonOrderId(amazonPage.invoice.orderId),
      sku: amazonPage.invoice.sku === "Unknown" ? "" : amazonPage.invoice.sku,
      quantity: amazonPage.invoice.quantity,
      awb: "",
      courier: "",
      defaultShippingRect: rects.shipping,
      defaultInvoiceRect: rects.invoice,
      defaultFullRect: rects.full,
    };
  }

  const marketplace = detectMarketplace(rawText);
  const extracted = extractMeeshoFields(rawText);
  const baseRects = defaultRects(marketplace);
  const labelBoundRects =
    marketplace === "flipkart" ? applyLabelBounds(baseRects, contentBounds) : baseRects;
  const rects =
    marketplace === "meesho" || marketplace === "flipkart"
      ? rectsSplitAtInvoice(labelBoundRects, positionedItems)
      : labelBoundRects;
  return {
    pageIndex,
    pageNumber: pageIndex + 1,
    text: rawText,
    marketplace,
    kind: marketplace === "meesho" || marketplace === "flipkart" ? "combined" : "unknown",
    orderId: "",
    sku: extracted.sku?.trim() ?? "",
    quantity: extracted.qty,
    awb: "",
    courier: extracted.partner === "Unknown" ? "" : extracted.partner,
    defaultShippingRect: rects.shipping,
    defaultInvoiceRect: rects.invoice,
    defaultFullRect: rects.full,
  };
}

export async function analyzeCropperPdfBytes(opts: {
  id: string;
  fileName: string;
  bytes: Uint8Array;
}): Promise<CropperDocument> {
  const bytes = new Uint8Array(opts.bytes.length);
  bytes.set(opts.bytes);
  const pdf = await loadPdfJsDocument(bytes);
  const pages: CropperPage[] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: 1 });
    const textContent = await page.getTextContent();
    const rawText = textFromItems(textContent);
    const positionedItems = positionedTextItems(textContent, viewport.height);
    const marketplace = detectMarketplace(rawText);
    const contentBounds = marketplace === "flipkart" ? await renderedLabelBounds(page) : null;
    pages.push({
      ...analyzePageText(rawText, i - 1, positionedItems, contentBounds),
      width: viewport.width,
      height: viewport.height,
    });
    await page.cleanup();
  }
  await pdf.destroy();

  const invoiceByOrder = new Map<string, number>();
  const shippingByOrder = new Map<string, number>();
  for (const p of pages) {
    if (p.marketplace !== "amazon" || !p.orderId) continue;
    if (p.kind === "invoice" && !invoiceByOrder.has(p.orderId)) {
      invoiceByOrder.set(p.orderId, p.pageIndex);
    }
    if (p.kind === "shipping" && !shippingByOrder.has(p.orderId)) {
      shippingByOrder.set(p.orderId, p.pageIndex);
    }
  }

  for (const p of pages) {
    if (p.marketplace !== "amazon") continue;
    if (p.kind === "shipping" && p.orderId) {
      const paired = invoiceByOrder.get(p.orderId);
      if (paired != null) p.pairedInvoicePageIndex = paired;
    }
    if (p.kind === "invoice" && p.orderId) {
      const paired = shippingByOrder.get(p.orderId);
      if (paired != null) p.pairedShippingPageIndex = paired;
    }
  }

  for (let i = 0; i < pages.length; i += 2) {
    const first = pages[i];
    const second = pages[i + 1];
    if (!first || !second) continue;
    if (first.marketplace === "amazon" && first.kind === "shipping" && second.kind === "invoice") {
      first.pairedInvoicePageIndex ??= second.pageIndex;
      second.pairedShippingPageIndex ??= first.pageIndex;
    }
  }

  return {
    id: opts.id,
    fileName: opts.fileName || "labels.pdf",
    bytes,
    pageCount: pdf.numPages,
    pages,
  };
}

export async function analyzeCropperPdf(file: File): Promise<CropperDocument> {
  return analyzeCropperPdfBytes({
    id: `${file.name}-${file.size}-${file.lastModified}`,
    fileName: file.name || "labels.pdf",
    bytes: new Uint8Array(await file.arrayBuffer()),
  });
}

export async function renderCropperPagePreview(
  doc: CropperDocument,
  pageIndex: number,
  scale = 1.4
): Promise<string> {
  const pdf = await loadPdfJsDocument(doc.bytes);
  try {
    const page = await pdf.getPage(pageIndex + 1);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("Canvas is not available.");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport, canvas }).promise;
    await page.cleanup();
    return canvas.toDataURL("image/png");
  } finally {
    await pdf.destroy();
  }
}

function rectToPdfBox(rect: CropRect, pageWidth: number, pageHeight: number) {
  const r = clampCropRect(rect);
  const left = r.x * pageWidth;
  const top = r.y * pageHeight;
  const width = r.width * pageWidth;
  const height = r.height * pageHeight;
  const bottom = pageHeight - top - height;
  return {
    left,
    bottom,
    right: left + width,
    top: bottom + height,
    width,
    height,
  };
}

export async function cropEntriesToPdf(entries: readonly CropExportEntry[]): Promise<Uint8Array> {
  if (entries.length === 0) throw new Error("Select at least one crop.");
  const { PDFDocument } = await import("pdf-lib");
  const out = await PDFDocument.create();
  const sourceCache = new Map<string, Awaited<ReturnType<typeof PDFDocument.load>>>();

  for (const entry of entries) {
    let src = sourceCache.get(entry.doc.id);
    if (!src) {
      src = await PDFDocument.load(entry.doc.bytes);
      sourceCache.set(entry.doc.id, src);
    }
    const sourcePage = src.getPage(entry.pageIndex);
    const { width: pageWidth, height: pageHeight } = sourcePage.getSize();
    const box = rectToPdfBox(entry.rect, pageWidth, pageHeight);
    const embedded = await out.embedPage(sourcePage, {
      left: box.left,
      bottom: box.bottom,
      right: box.right,
      top: box.top,
    });
    const page = out.addPage([box.width, box.height]);
    page.drawPage(embedded, {
      x: 0,
      y: 0,
      width: box.width,
      height: box.height,
    });
  }

  return new Uint8Array(await out.save({ useObjectStreams: false }));
}

export async function zipCroppedPdfs(
  groups: readonly { fileName: string; entries: CropExportEntry[] }[]
): Promise<Uint8Array> {
  if (groups.length === 0) throw new Error("No crops to zip.");
  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();
  for (const group of groups) {
    const pdf = await cropEntriesToPdf(group.entries);
    zip.file(group.fileName.endsWith(".pdf") ? group.fileName : `${group.fileName}.pdf`, pdf);
  }
  const bytes = await zip.generateAsync({ type: "uint8array" });
  return new Uint8Array(bytes);
}

export function cropRectForPage(page: CropperPage, mode: CropMode): CropRect {
  if (mode === "invoice") return page.defaultInvoiceRect;
  if (mode === "full") return page.defaultFullRect;
  return page.defaultShippingRect;
}
