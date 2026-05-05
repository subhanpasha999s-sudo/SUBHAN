/**
 * One-off: peek text from first page of a Meesho label PDF (run with node).
 * Usage: node scripts/peek-pdf-text.mjs <path-to.pdf>
 */
import fs from "fs";
import path from "path";

const pdfPath =
  process.argv[2] ??
  "/Users/mohammadsubhan/Library/Application Support/Cursor/User/workspaceStorage/ceaf8d89e9533ce02a50002a8d163c50/pdfs/734fe037-905c-4ea8-bbd0-b713ae6bd150/Sub_Order_Labels_4a863f2f-7434-497b-9e55-7e223388bcaa.pdf";

const buf = fs.readFileSync(pdfPath);
const data = new Uint8Array(buf);

const pdfjs = await import(
  path.join(process.cwd(), "node_modules/pdfjs-dist/legacy/build/pdf.mjs")
);

// Node: no worker
const task = pdfjs.getDocument({
  data,
  useSystemFonts: true,
  verbosity: 0,
  useWorkerFetch: false,
  disableStream: true,
  isEvalSupported: false,
});
const doc = await task.promise;
const page = await doc.getPage(1);
const tc = await page.getTextContent();
const text = tc.items.map((it) => ("str" in it ? it.str : "")).join(" ");
console.log("--- page 1 text (condensed) ---\n");
console.log(text.replace(/\s+/g, " ").slice(0, 4000));
console.log("\n--- len ---", text.length);
await doc.destroy();
