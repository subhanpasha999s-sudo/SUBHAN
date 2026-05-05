"use client";

import { PDFDocument } from "pdf-lib";

import type { ProcessedLabel } from "@/types/label";

export async function mergeLabelsToPdfBytesMain(
  rows: ProcessedLabel[]
): Promise<Uint8Array> {
  const merged = await PDFDocument.create();
  for (const row of rows) {
    const part = await PDFDocument.load(row.singlePagePdfBytes);
    const pages = await merged.copyPages(part, part.getPageIndices());
    pages.forEach((p) => merged.addPage(p));
  }
  return merged.save({ useObjectStreams: false });
}
