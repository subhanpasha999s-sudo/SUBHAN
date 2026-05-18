"use client";

import * as React from "react";
import {
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Loader2,
  Upload,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface SkuSpreadsheetUploadZoneProps {
  disabled?: boolean;
  busy?: boolean;
  onFile: (file: File) => void | Promise<void>;
}

export function SkuSpreadsheetUploadZone({
  disabled,
  busy,
  onFile,
}: SkuSpreadsheetUploadZoneProps) {
  const inputRef = React.useRef<HTMLInputElement>(null);

  async function handleFiles(files: FileList | null) {
    const f = files?.[0];
    if (!f) return;
    await onFile(f);
  }

  function downloadSampleCsv() {
    const csv = [
      "SKU",
      "PS-PI-BL-0199",
      "TSHIRT-BLACK-M",
      "AMZ-BOWL-001",
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "tulmin-sku-sample.csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-[14px] border border-dashed border-border bg-gradient-to-b from-muted/30 to-muted/10 transition-[border-color,background-color] hover:border-primary/35 dark:from-muted/20 dark:to-muted/5",
        busy && "pointer-events-none opacity-70",
        disabled && "opacity-50"
      )}
      onDragEnter={(e) => e.preventDefault()}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        if (disabled || busy) return;
        void handleFiles(e.dataTransfer.files);
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".csv,text/csv,.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
        className="hidden"
        disabled={disabled || busy}
        onChange={(e) => {
          void handleFiles(e.target.files);
          e.target.value = "";
        }}
      />
      <div className="flex flex-col gap-5 px-5 py-6 sm:px-6 sm:py-7">
        <div className="flex flex-col gap-5 text-left lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <div
              className={cn(
                "flex size-14 shrink-0 items-center justify-center rounded-2xl border border-border/80 bg-background/65 shadow-inner",
                busy && "border-primary/30 bg-primary/10"
              )}
            >
              {busy ? (
                <Loader2 className="size-7 animate-spin text-primary" aria-hidden />
              ) : (
                <FileSpreadsheet
                  className="size-7 text-muted-foreground"
                  strokeWidth={1.35}
                />
              )}
            </div>
            <div className="space-y-1">
              <p className="text-[18px] font-semibold tracking-tight text-foreground">
                Import only the SKUs you want to map
              </p>
              <p className="max-w-xl text-[13px] leading-snug text-muted-foreground">
                Use Tulmin&apos;s simple sample file with one{" "}
                <span className="font-semibold text-foreground">SKU</span> column. No full stock file needed.
              </p>
              <div className="flex flex-wrap gap-2 pt-2">
                {["Only SKU data", "CSV or Excel", "Private by default"].map((item) => (
                  <span
                    key={item}
                    className="inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-background/60 px-2.5 py-1 text-[11px] font-medium text-muted-foreground"
                  >
                    <CheckCircle2 className="size-3.5 text-emerald-500" aria-hidden />
                    {item}
                  </span>
                ))}
              </div>
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            size="lg"
            className="min-h-11 shrink-0 px-5 text-[13px] font-semibold"
            disabled={disabled || busy}
            onClick={downloadSampleCsv}
          >
            <Download className="mr-2 size-4" aria-hidden />
            Sample CSV
          </Button>
          <Button
            type="button"
            size="lg"
            className="min-h-11 shrink-0 px-5 text-[13px] font-semibold shadow-elevate-sm"
            disabled={disabled || busy}
            onClick={() => inputRef.current?.click()}
            aria-describedby="sku-upload-meesho-steps"
          >
            <Upload className="mr-2 size-4" aria-hidden />
            Choose file
          </Button>
        </div>

        <details
          id="sku-upload-meesho-steps"
          className="group rounded-xl border border-border/60 bg-background/45 px-4 py-3 text-left text-[13px] leading-relaxed text-muted-foreground"
        >
          <summary className="cursor-pointer list-none text-[12px] font-semibold text-foreground outline-none transition-colors hover:text-primary">
            Need to download SKUs from a marketplace?
            <span className="ml-2 text-muted-foreground group-open:hidden">Show guides</span>
            <span className="ml-2 hidden text-muted-foreground group-open:inline">Hide guides</span>
          </summary>
          <div className="mt-3 grid gap-3 lg:grid-cols-3">
            {[
              {
                title: "Meesho",
                steps: "Supplier Panel -> Inventory -> Bulk Stock Update -> download Existing Stock Upload File.",
              },
              {
                title: "Flipkart",
                steps: "Seller Hub -> Listings / Inventory -> export active listings or product catalog with seller SKU.",
              },
              {
                title: "Amazon",
                steps: "Seller Central -> Inventory Reports / Manage Inventory -> download a report with seller SKU.",
              },
            ].map((guide) => (
              <div
                key={guide.title}
                className="rounded-xl border border-border/55 bg-muted/20 px-3 py-3"
              >
                <p className="text-[12px] font-semibold text-foreground">
                  {guide.title}
                </p>
                <p className="mt-1.5 text-[12px] leading-relaxed">
                  {guide.steps}
                </p>
              </div>
            ))}
          </div>
          <p className="mt-3 text-[12px]">
            After download, keep or copy just the SKU column into the Tulmin sample file, then upload it here.
          </p>
        </details>
      </div>
    </div>
  );
}
