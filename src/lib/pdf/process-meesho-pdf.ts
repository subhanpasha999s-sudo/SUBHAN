"use client";

import { PDFDocument } from "pdf-lib";
import type {
  PDFPageProxy,
  TextContent,
} from "pdfjs-dist/types/src/display/api";

import { extractMeeshoFields } from "@/lib/meesho-parse";
import { fileToUint8Array } from "@/lib/pdf/file-to-bytes";
import { loadPdfJsDocument } from "@/lib/pdf/configure-pdfjs";
import type { ProcessedLabel } from "@/types/label";
import { yieldToMain } from "@/lib/yield-ui";

function randomId(prefix: string): string {
  const n =
    crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toFixed(8)}`;
  return `${prefix}-${n}`;
}

function textFromContent(items: TextContent): string {
  let out = "";
  for (const it of items.items) {
    if ("str" in it && typeof it.str === "string") out += `${it.str} `;
  }
  return out;
}

async function rasterPageThumb(
  page: PDFPageProxy,
  scale = 0.22
): Promise<string | null> {
  if (typeof document === "undefined") return null;
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const renderTask = page.render({
    canvasContext: ctx,
    viewport,
    canvas,
  });
  await renderTask.promise;
  return canvas.toDataURL("image/jpeg", 0.72);
}

export async function processMeeshoPdfFile(opts: {
  file: File;
  batchId: string;
  onProgress?: (done: number, total: number) => void;
}): Promise<{ labels: ProcessedLabel[]; error?: string }> {
  try {
    const orig = await fileToUint8Array(opts.file);

    const srcLib = await PDFDocument.load(orig);
    const pageCount = srcLib.getPageCount();
    const pdfJsDoc = await loadPdfJsDocument(orig);

    const labels: ProcessedLabel[] = [];

    for (let i = 0; i < pageCount; i++) {
      const one = await PDFDocument.create();
      const [copied] = await one.copyPages(srcLib, [i]);
      one.addPage(copied);
      const singleBytes = new Uint8Array(
        await one.save({ useObjectStreams: false })
      );

      const jsPageNum = i + 1;
      const pageObj = await pdfJsDoc.getPage(jsPageNum);

      const tc = await pageObj.getTextContent();
      const rawText = textFromContent(tc);
      const extracted = extractMeeshoFields(rawText);

      let thumbDataUrl: string | null = null;
      try {
        thumbDataUrl = await rasterPageThumb(pageObj);
      } catch {
        thumbDataUrl = null;
      }
      await pageObj.cleanup();

      labels.push({
        id: randomId("lbl"),
        batchId: opts.batchId,
        sourceFileName: opts.file.name,
        pageIndexOneBased: jsPageNum,
        sku: extracted.sku,
        qty: extracted.qty,
        partner: extracted.partner,
        brand: extracted.brand,
        masterSku: null,
        category: null,
        singlePagePdfBytes: singleBytes,
        thumbDataUrl,
      });

      opts.onProgress?.(i + 1, pageCount);
      await yieldToMain();
    }

    await pdfJsDoc.destroy();
    return { labels };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to parse PDF.";
    return { labels: [], error: msg };
  }
}
