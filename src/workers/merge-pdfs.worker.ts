/// <reference lib="webworker" />

import { PDFDocument } from "pdf-lib";

type InMsg = { buffers: ArrayBuffer[] };

self.addEventListener("message", async (e: MessageEvent<InMsg>) => {
  const { buffers } = e.data ?? { buffers: [] };
  try {
    const merged = await PDFDocument.create();
    for (const ab of buffers) {
      const u = new Uint8Array(ab);
      const doc = await PDFDocument.load(u);
      const pages = await merged.copyPages(doc, doc.getPageIndices());
      pages.forEach((p) => merged.addPage(p));
    }
    const out = await merged.save({
      useObjectStreams: false,
    });
    const bytes = out.buffer.slice(
      out.byteOffset,
      out.byteOffset + out.byteLength
    );
    self.postMessage({ ok: true as const, bytes }, [bytes]);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    self.postMessage({ ok: false as const, message });
  }
});
