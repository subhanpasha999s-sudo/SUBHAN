import type { PDFDocumentProxy } from "pdfjs-dist";

import { ensureReadableStreamAsyncIterator } from "@/lib/pdf/readable-stream-async-iterator-polyfill";

/** Legacy ESM build avoids stream/fetch edge cases in Safari and some WebViews. */
type PdfJsModule = typeof import("pdfjs-dist/legacy/build/pdf.mjs");

let pdfjsLoaded: PdfJsModule | null = null;

function resolvePdfJsWorkerSrc(): string | undefined {
  if (
    typeof self !== "undefined" &&
    "location" in self &&
    self.location?.origin &&
    /^https?:/i.test(self.location.origin)
  ) {
    return `${self.location.origin}/pdf.worker.min.mjs`;
  }
  /** Main thread only (SSR / Node has no Worker location) */
  if (typeof window !== "undefined" && window.location?.origin) {
    return `${window.location.origin}/pdf.worker.min.mjs`;
  }
  return undefined;
}

export async function getPdfJs(): Promise<PdfJsModule> {
  if (pdfjsLoaded) return pdfjsLoaded;

  /** Required before pdf.js 5 reads text chunks from worker streams */
  ensureReadableStreamAsyncIterator();

  pdfjsLoaded = await import("pdfjs-dist/legacy/build/pdf.mjs");

  const ws = resolvePdfJsWorkerSrc();
  if (ws) {
    pdfjsLoaded.GlobalWorkerOptions.workerSrc = ws;
  }

  return pdfjsLoaded;
}

/**
 * Own a copy of bytes so the worker transfer doesn't detach a buffer still used by pdf-lib.
 */
export async function loadPdfJsDocument(bytes: Uint8Array): Promise<PDFDocumentProxy> {
  const pdfjs = await getPdfJs();
  const copy = new Uint8Array(bytes.length);
  copy.set(bytes);

  const task = pdfjs.getDocument({
    data: copy,
    verbosity: 0,
    /** Avoid fetch + ReadableStream paths inside the worker for CMap/font assets. */
    useWorkerFetch: false,
    disableStream: true,
  });

  return task.promise;
}
