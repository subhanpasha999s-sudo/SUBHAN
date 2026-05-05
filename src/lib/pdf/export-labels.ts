"use client";

import JSZip from "jszip";

import { mergePdfBytesViaWorker } from "@/lib/pdf/merge-worker";
import type { ProcessedLabel } from "@/types/label";

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function downloadSingleLabel(label: ProcessedLabel) {
  const name = sanitizeFileName(`${label.partner}-${label.sku ?? "SKU"}-p${label.pageIndexOneBased}.pdf`);
  const data = Uint8Array.from(label.singlePagePdfBytes);
  const blob = new Blob([data], { type: "application/pdf" });
  downloadBlob(blob, name);
}

function sanitizeFileName(s: string) {
  return s.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 180);
}

export async function mergeLabelsToPdfBytes(
  rows: ProcessedLabel[]
): Promise<Uint8Array> {
  try {
    return await mergePdfBytesViaWorker(rows);
  } catch {
    const { mergeLabelsToPdfBytesMain } =
      await import("@/lib/pdf/merge-main-thread");
    return mergeLabelsToPdfBytesMain(rows);
  }
}

export async function downloadMergedPdf(rows: ProcessedLabel[], basename: string) {
  const bytes = await mergeLabelsToPdfBytes(rows);
  const data = Uint8Array.from(bytes);
  downloadBlob(new Blob([data], { type: "application/pdf" }), `${basename}.pdf`);
}

/** Zip filenames grouped under partner folder when `folderize` true */
export async function downloadZipOfLabels(rows: ProcessedLabel[], basename: string, folderize = true) {
  const zip = new JSZip();
  for (const row of rows) {
    const folder = folderize ? sanitizeFileName(row.partner) : "";
    const file = `${folder ? `${folder}/` : ""}${sanitizeFileName(`${row.sku ?? "SKU"}_${row.pageIndexOneBased}_${row.sourceFileName}.pdf`)}`;
    zip.file(file, Uint8Array.from(row.singlePagePdfBytes));
  }
  const blob = await zip.generateAsync({
    type: "blob",
    compression: "DEFLATE",
  });
  downloadBlob(blob, `${basename}.zip`);
}
