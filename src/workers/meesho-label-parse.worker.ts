/// <reference lib="webworker" />

import {
  parseMeeshoLabelPdfFromBytes,
  type PdfLabelParseStats,
} from "@/lib/meesho-label-export/parse-meesho-label-pdf-core";

import type { AmazonTaxInvoicePage } from "@/lib/amazon-label-engine";
import type { PdfParseYieldPolicy } from "@/lib/runtime/performance-tier";
import type { MeeshoLabelRecord } from "@/types/meesho-label-export";

type ParseReq = {
  kind: "parse";
  buffer: ArrayBuffer;
  yieldPolicy?: PdfParseYieldPolicy;
};

type WorkerOut =
  | { kind: "progress"; done: number; total: number }
  | {
      kind: "result";
      rows: MeeshoLabelRecord[];
      amazonInvoices: AmazonTaxInvoicePage[];
      stats: PdfLabelParseStats;
      error?: string;
      pdfBuffer: ArrayBuffer;
    }
  | { kind: "error"; message: string };

function isParseReq(msg: unknown): msg is ParseReq {
  if (typeof msg !== "object" || msg === null) return false;
  const m = msg as ParseReq;
  if (m.kind !== "parse" || !(m.buffer instanceof ArrayBuffer)) return false;
  if (m.yieldPolicy != null && typeof m.yieldPolicy !== "string") return false;
  return true;
}

self.addEventListener("message", (e: MessageEvent<unknown>) => {
  if (!isParseReq(e.data)) return;
  const req = e.data;

  const run = async () => {
    try {
      const bytes = new Uint8Array(req.buffer);
      const out = await parseMeeshoLabelPdfFromBytes({
        pdfBytes: bytes,
        yieldPolicy: req.yieldPolicy ?? "balanced",
        onProgress: (done, total) =>
          self.postMessage({
            kind: "progress",
            done,
            total,
          } satisfies WorkerOut),
      });

      const transfer: Transferable[] = [];
      let pdfBuffer: ArrayBuffer;
      if (out.pdfBytes.byteLength > 0) {
        const copy = new Uint8Array(out.pdfBytes.byteLength);
        copy.set(out.pdfBytes);
        pdfBuffer = copy.buffer;
        transfer.push(pdfBuffer);
      } else {
        pdfBuffer = new ArrayBuffer(0);
      }

      self.postMessage(
        {
          kind: "result",
          rows: out.rows,
          amazonInvoices: out.amazonInvoices,
          stats: out.stats,
          error: out.error,
          pdfBuffer,
        } satisfies WorkerOut,
        transfer
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      self.postMessage({ kind: "error", message } satisfies WorkerOut);
    }
  };

  void run();
});
