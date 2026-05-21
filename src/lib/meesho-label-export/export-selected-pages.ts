"use client";

/**
 * Builds a PDF containing only the given 1-based page numbers (order preserved, duplicates removed).
 * `pdf-lib` is loaded only when exporting so Tulmin stays lean on first paint.
 */
export async function exportPdfPages(
  sourcePdfBytes: Uint8Array,
  pagesOneBased: number[]
): Promise<Uint8Array> {
  const { PDFDocument, rgb } = await import("pdf-lib");

  const uniqueSorted = [...new Set(pagesOneBased)]
    .filter((p) => Number.isInteger(p) && p >= 1)
    .sort((a, b) => a - b);

  if (uniqueSorted.length === 0) {
    throw new Error("No pages to export.");
  }

  const src = await PDFDocument.load(sourcePdfBytes);
  const n = src.getPageCount();
  for (const p of uniqueSorted) {
    if (p > n) {
      throw new Error(`Page ${p} is out of range (PDF has ${n} pages).`);
    }
  }

  const out = await PDFDocument.create();
  const zeroBased = uniqueSorted.map((p) => p - 1);
  const copied = await out.copyPages(src, zeroBased);
  for (const page of copied) {
    out.addPage(page);
  }

  return new Uint8Array(await out.save({ useObjectStreams: false }));
}

/**
 * Same as `exportPdfPages` but **keeps the order** of `pagesOneBased` (first occurrence wins;
 * duplicates skipped). Use for grouped / sequenced exports.
 */
export async function exportPdfPagesInOrder(
  sourcePdfBytes: Uint8Array,
  pagesOneBased: readonly number[]
): Promise<Uint8Array> {
  const { PDFDocument, rgb } = await import("pdf-lib");

  const seen = new Set<number>();
  const order: number[] = [];
  for (const p of pagesOneBased) {
    if (!Number.isInteger(p) || p < 1) continue;
    if (seen.has(p)) continue;
    seen.add(p);
    order.push(p);
  }

  if (order.length === 0) {
    throw new Error("No pages to export.");
  }

  const src = await PDFDocument.load(sourcePdfBytes);
  const n = src.getPageCount();
  for (const p of order) {
    if (p > n) {
      throw new Error(`Page ${p} is out of range (PDF has ${n} pages).`);
    }
  }

  const out = await PDFDocument.create();
  const zeroBased = order.map((p) => p - 1);
  const copied = await out.copyPages(src, zeroBased);
  for (const page of copied) {
    out.addPage(page);
  }

  return new Uint8Array(await out.save({ useObjectStreams: false }));
}

/**
 * Builds one PDF by copying pages in order, where each page may come from a different source file.
 * `importKey` must be stable per logical import (e.g. UUID) so each PDF is loaded at most once.
 */
export type MultiSourcePdfExportProgress = {
  phase: "loading" | "copying" | "saving";
  done: number;
  total: number;
};

export type MultiSourcePdfExportOptions = {
  onProgress?: (progress: MultiSourcePdfExportProgress) => void;
  yieldEvery?: number;
};

async function yieldToBrowser(): Promise<void> {
  await new Promise<void>((resolve) => {
    if (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") {
      window.requestAnimationFrame(() => resolve());
    } else {
      setTimeout(resolve, 0);
    }
  });
}

export async function exportPdfPagesFromMultiSourceOrdered(
  steps: readonly {
    importKey: string;
    sourcePdfBytes: Uint8Array;
    pageOneBased: number;
    overlayText?: string;
  }[],
  options: MultiSourcePdfExportOptions = {}
): Promise<Uint8Array> {
  if (steps.length === 0) throw new Error("No pages to export.");

  const { PDFDocument, rgb } = await import("pdf-lib");
  const out = await PDFDocument.create();
  const font = await out.embedFont("Helvetica-Bold");
  type LoadedPdfDoc = Awaited<ReturnType<typeof PDFDocument.load>>;
  const docCache = new Map<string, LoadedPdfDoc>();

  async function getDoc(importKey: string, sourcePdfBytes: Uint8Array) {
    let src = docCache.get(importKey);
    if (!src) {
      src = await PDFDocument.load(sourcePdfBytes);
      docCache.set(importKey, src);
    }
    return src;
  }

  const yieldEvery = Math.max(1, options.yieldEvery ?? (steps.length >= 1000 ? 25 : 75));
  options.onProgress?.({ phase: "loading", done: 0, total: steps.length });

  for (let index = 0; index < steps.length; index += 1) {
    const step = steps[index];
    const src = await getDoc(step.importKey, step.sourcePdfBytes);
    const nPages = src.getPageCount();
    const p = step.pageOneBased;
    if (!Number.isInteger(p) || p < 1 || p > nPages) {
      throw new Error(
        `Page ${p} is out of range for one of the imports (PDF has ${nPages} page(s)).`
      );
    }
    const [copied] = await out.copyPages(src, [p - 1]);
    if (step.overlayText?.trim()) {
      const { width, height } = copied.getSize();
      const text = step.overlayText.trim();
      const fontSize = Math.max(12, Math.min(18, width / Math.max(16, text.length * 0.5)));
      const textWidth = font.widthOfTextAtSize(text, fontSize);
      const boxW = Math.min(width * 0.48, textWidth + 28);
      const boxH = fontSize + 14;
      const x = Math.max(18, width - boxW - width * 0.08);
      const y = Math.max(40, height * 0.11);
      copied.drawRectangle({
        x,
        y,
        width: boxW,
        height: boxH,
        color: rgb(1, 1, 1),
        borderColor: rgb(0, 0, 0),
        borderWidth: 0.75,
      });
      copied.drawText(text, {
        x: x + (boxW - textWidth) / 2,
        y: y + 6,
        size: fontSize,
        font,
        color: rgb(0, 0, 0),
      });
    }
    out.addPage(copied);
    const done = index + 1;
    if (done === steps.length || done % yieldEvery === 0) {
      options.onProgress?.({ phase: "copying", done, total: steps.length });
      await yieldToBrowser();
    }
  }

  options.onProgress?.({ phase: "saving", done: steps.length, total: steps.length });
  await yieldToBrowser();
  return new Uint8Array(await out.save({ useObjectStreams: false }));
}

export function triggerPdfDownload(bytes: Uint8Array, filename: string) {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const blob = new Blob([copy], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".pdf") ? filename : `${filename}.pdf`;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function triggerZipDownload(bytes: Uint8Array, filename: string) {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const blob = new Blob([copy], { type: "application/zip" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".zip") ? filename : `${filename}.zip`;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
