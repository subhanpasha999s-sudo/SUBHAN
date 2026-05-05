"use client";

import type { ProcessedLabel } from "@/types/label";

export async function mergePdfBytesViaWorker(
  rows: ProcessedLabel[]
): Promise<Uint8Array> {
  if (typeof Worker === "undefined" || rows.length === 0) {
    const { mergeLabelsToPdfBytesMain } =
      await import("@/lib/pdf/merge-main-thread");
    return mergeLabelsToPdfBytesMain(rows);
  }

  const buffers = rows.map((r) => {
    const u = Uint8Array.from(r.singlePagePdfBytes);
    return u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength);
  });

  return new Promise((resolve, reject) => {
    const worker = new Worker(
      new URL("../../workers/merge-pdfs.worker.ts", import.meta.url),
      { type: "module" }
    );
    worker.onmessage = (
      ev: MessageEvent<{ ok: boolean; bytes?: ArrayBuffer; message?: string }>
    ) => {
      worker.terminate();
      const d = ev.data;
      if (d?.ok && d.bytes) {
        resolve(new Uint8Array(d.bytes));
      } else {
        reject(new Error(d?.message ?? "Worker merge failed"));
      }
    };
    worker.onerror = (err) => {
      worker.terminate();
      reject(err);
    };
    worker.postMessage({ buffers }, buffers);
  });
}
