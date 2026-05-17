import { parseMeeshoLabelPdfFromBytes } from "@/lib/meesho-label-export/parse-meesho-label-pdf-core";
import { fileToUint8Array } from "@/lib/pdf/file-to-bytes";
import {
  canUseDedicatedModuleWorker,
  raceWithTimeout,
} from "@/lib/runtime/client-capabilities";
import type { PdfParseYieldPolicy } from "@/lib/runtime/performance-tier";
import type { AmazonTaxInvoicePage } from "@/lib/amazon-label-engine";
import type { MeeshoLabelRecord } from "@/types/meesho-label-export";

/** Huge PDFs: fail fast-ish with a readable error instead of an infinite spinner */
const PARSE_DEADLINE_MS = 15 * 60 * 1000;

type ParseResult = {
  rows: MeeshoLabelRecord[];
  amazonInvoices: AmazonTaxInvoicePage[];
  pdfBytes: Uint8Array;
  error?: string;
};

async function parseViaWorker(opts: {
  file: File;
  onProgress?: (done: number, total: number) => void;
  yieldPolicy?: PdfParseYieldPolicy;
}): Promise<ParseResult> {
  const buffer = await opts.file.arrayBuffer();

  return await new Promise((resolve, reject) => {
    const worker = new Worker(
      new URL("../../workers/meesho-label-parse.worker.ts", import.meta.url),
      { type: "module" }
    );

    const cleanup = () => {
      try {
        worker.terminate();
      } catch {
        /* noop */
      }
    };

    worker.onmessage = (
      ev: MessageEvent<{
        kind: string;
        done?: number;
        total?: number;
        rows?: MeeshoLabelRecord[];
        amazonInvoices?: AmazonTaxInvoicePage[];
        error?: string;
        pdfBuffer?: ArrayBuffer;
        message?: string;
      }>
    ) => {
      const d = ev.data;
      if (!d || typeof d !== "object") return;

      if (d.kind === "progress" && typeof d.done === "number" && typeof d.total === "number") {
        opts.onProgress?.(d.done, d.total);
        return;
      }

      if (d.kind === "error" && typeof d.message === "string") {
        cleanup();
        reject(new Error(d.message));
        return;
      }

      if (d.kind === "result" && Array.isArray(d.rows) && d.pdfBuffer instanceof ArrayBuffer) {
        cleanup();
        resolve({
          rows: d.rows,
          amazonInvoices: d.amazonInvoices ?? [],
          pdfBytes: new Uint8Array(d.pdfBuffer),
          error: d.error,
        });
      }
    };

    worker.onerror = (err) => {
      cleanup();
      reject(err);
    };

    worker.postMessage(
      {
        kind: "parse",
        buffer,
        yieldPolicy: opts.yieldPolicy ?? "balanced",
      } satisfies {
        kind: "parse";
        buffer: ArrayBuffer;
        yieldPolicy?: PdfParseYieldPolicy;
      },
      [buffer],
    );
  });
}

/**
 * Parse Meesho label PDF — prefers a dedicated Worker so the UI thread stays interactive.
 */
export async function parseMeeshoLabelPdf(opts: {
  file: File;
  onProgress?: (done: number, total: number) => void;
  yieldPolicy?: PdfParseYieldPolicy;
}): Promise<ParseResult> {
  const yieldPolicy = opts.yieldPolicy ?? "balanced";

  const runMain = async () => {
    const pdfBytes = await fileToUint8Array(opts.file);
    return raceWithTimeout(
      parseMeeshoLabelPdfFromBytes({
        pdfBytes,
        onProgress: opts.onProgress,
        yieldPolicy,
      }),
      PARSE_DEADLINE_MS,
      "PDF parse",
    );
  };

  if (canUseDedicatedModuleWorker()) {
    try {
      return await raceWithTimeout(
        parseViaWorker({ ...opts, yieldPolicy }),
        PARSE_DEADLINE_MS,
        "PDF parse (worker)",
      );
    } catch {
      /** Worker unavailable, timed out, or threw — same-origin / WebView quirks */
      return runMain();
    }
  }

  return runMain();
}
