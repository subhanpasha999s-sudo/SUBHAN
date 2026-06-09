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

function amazonOverlayLines(text: string): string[] {
  const lines = text
    .split(/\s+\|\s+/)
    .map((line) => line.trim())
    .filter(Boolean);
  return lines.length > 0 ? lines : [text.trim()];
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

  const first = steps[0];
  const canUseOriginalPdf =
    first &&
    steps.every(
      (step, index) =>
        step.importKey === first.importKey &&
        step.sourcePdfBytes === first.sourcePdfBytes &&
        !step.overlayText?.trim() &&
        step.pageOneBased === index + 1
    );
  if (canUseOriginalPdf) {
    const src = await getDoc(first.importKey, first.sourcePdfBytes);
    if (src.getPageCount() === steps.length) {
      options.onProgress?.({ phase: "copying", done: steps.length, total: steps.length });
      return new Uint8Array(first.sourcePdfBytes);
    }
  }

  const out = await PDFDocument.create();
  const hasOverlayText = steps.some((step) => step.overlayText?.trim());
  const font = hasOverlayText ? await out.embedFont("Helvetica-Bold") : null;

  const canCopySameSourceBatch =
    first &&
    !hasOverlayText &&
    steps.every(
      (step) =>
        step.importKey === first.importKey &&
        step.sourcePdfBytes === first.sourcePdfBytes &&
        Number.isInteger(step.pageOneBased) &&
        step.pageOneBased >= 1
    );
  if (canCopySameSourceBatch) {
    const src = await getDoc(first.importKey, first.sourcePdfBytes);
    const nPages = src.getPageCount();
    const pageIndices = steps.map((step) => {
      if (step.pageOneBased > nPages) {
        throw new Error(
          `Page ${step.pageOneBased} is out of range for one of the imports (PDF has ${nPages} page(s)).`
        );
      }
      return step.pageOneBased - 1;
    });
    const copied = await out.copyPages(src, pageIndices);
    for (const page of copied) out.addPage(page);
    options.onProgress?.({ phase: "copying", done: steps.length, total: steps.length });
    await yieldToBrowser();
    options.onProgress?.({ phase: "saving", done: steps.length, total: steps.length });
    await yieldToBrowser();
    return new Uint8Array(await out.save({ useObjectStreams: steps.length >= 100 }));
  }

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
      if (!font) {
        out.addPage(copied);
        continue;
      }
      const lines = amazonOverlayLines(text);
      const marginX = Math.max(18, Math.min(28, width * 0.04));
      const maxBoxW = Math.max(150, width - marginX * 2);
      let fontSize = 13;
      let lineWidths = lines.map((line) => font.widthOfTextAtSize(line, fontSize));
      while (fontSize > 8 && Math.max(...lineWidths) + 24 > maxBoxW) {
        fontSize -= 0.5;
        lineWidths = lines.map((line) => font.widthOfTextAtSize(line, fontSize));
      }
      const lineGap = Math.max(2, fontSize * 0.22);
      const boxW = Math.min(maxBoxW, Math.max(...lineWidths) + 24);
      const boxH = lines.length * fontSize + (lines.length - 1) * lineGap + 14;
      const x = width - boxW - marginX;
      const y = Math.max(28, height * 0.055);
      copied.drawRectangle({
        x,
        y,
        width: boxW,
        height: boxH,
        color: rgb(1, 1, 1),
        borderColor: rgb(0, 0, 0),
        borderWidth: 0.75,
      });
      lines.forEach((line, lineIndex) => {
        const textWidth = lineWidths[lineIndex] ?? font.widthOfTextAtSize(line, fontSize);
        copied.drawText(line, {
          x: x + (boxW - textWidth) / 2,
          y: y + boxH - 7 - fontSize - lineIndex * (fontSize + lineGap),
          size: fontSize,
          font,
          color: rgb(0, 0, 0),
        });
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
  return new Uint8Array(await out.save({ useObjectStreams: steps.length >= 250 }));
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
