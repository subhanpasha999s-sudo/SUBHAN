"use client";

import * as React from "react";
import {
  CheckCircle2,
  CircleHelp,
  Download,
  FileSpreadsheet,
  Loader2,
  Upload,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
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
  const [dragActive, setDragActive] = React.useState(false);
  const sampleRows = React.useMemo(
    () => [
      "Fill it with your marketplace SKU",
      "PS-PI-BL-0199",
      "TSHIRT-BLACK-M",
      "AMZ-BOWL-001",
    ],
    []
  );

  async function handleFiles(files: FileList | null) {
    const f = files?.[0];
    if (!f) return;
    setDragActive(false);
    await onFile(f);
  }

  function downloadBlob(fileName: string, body: string, type: string) {
    const blob = new Blob([body], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function downloadSampleCsv() {
    downloadBlob(
      "tulmin-sku-sample.csv",
      sampleRows.join("\n"),
      "text/csv;charset=utf-8"
    );
  }

  function downloadSampleExcel() {
    const cells = sampleRows
      .map((value) => `<tr><td>${value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")}</td></tr>`)
      .join("");
    downloadBlob(
      "tulmin-sku-sample.xls",
      `<!doctype html><html><head><meta charset="utf-8" /></head><body><table>${cells}</table></body></html>`,
      "application/vnd.ms-excel;charset=utf-8"
    );
  }

  return (
    <div
      className={cn(
        "motion-lift relative overflow-hidden rounded-[14px] border border-dashed border-border bg-gradient-to-b from-muted/30 to-muted/10 transition-[transform,border-color,background-color,box-shadow,opacity] hover:border-primary/35 dark:from-muted/20 dark:to-muted/5",
        dragActive &&
          "border-primary/60 bg-primary/[0.055] shadow-[0_0_0_4px_rgb(63_108_255/0.10),0_24px_70px_-44px_rgb(63_108_255/0.95)]",
        busy && "pointer-events-none opacity-70",
        disabled && "opacity-50"
      )}
      onDragEnter={(e) => {
        e.preventDefault();
        if (!disabled && !busy) setDragActive(true);
      }}
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled && !busy) setDragActive(true);
      }}
      onDragLeave={(e) => {
        if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
        setDragActive(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDragActive(false);
        if (disabled || busy) return;
        void handleFiles(e.dataTransfer.files);
      }}
    >
      <div
        className={cn(
          "pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-150 ease-smooth",
          (dragActive || busy) && "opacity-100"
        )}
        aria-hidden
      >
        <div className="absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-primary/65 to-transparent" />
        <div className="absolute left-1/2 top-0 size-40 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/10 blur-3xl" />
      </div>
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
                Download the sample file and fill it with your marketplace SKU.
                Tulmin will use those SKUs to map with{" "}
                <span className="inline-flex items-center gap-1 align-middle">
                  <span>master SKU</span>
                  <Tooltip>
                    <TooltipTrigger
                      type="button"
                      className="inline-flex size-5 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                      aria-label="What is a master SKU?"
                    >
                      <CircleHelp className="size-3.5" aria-hidden />
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-[260px] text-center">
                      One product can have many marketplace SKUs. Master SKU groups them together for easy label filtering.
                    </TooltipContent>
                  </Tooltip>
                </span>
                .
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
          <div className="flex flex-wrap gap-2 lg:justify-end">
            <Button
              type="button"
              variant="outline"
              size="lg"
              className="min-h-11 shrink-0 px-4 text-[13px] font-semibold"
              disabled={disabled || busy}
              onClick={downloadSampleExcel}
            >
              <Download className="mr-2 size-4" aria-hidden />
              Sample Excel
            </Button>
            <Button
              type="button"
              variant="outline"
              size="lg"
              className="min-h-11 shrink-0 px-4 text-[13px] font-semibold"
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
        </div>

        <details
          id="sku-upload-meesho-steps"
          className="group rounded-xl border border-border/60 bg-background/45 px-4 py-3 text-left text-[13px] leading-relaxed text-muted-foreground"
        >
          <summary className="cursor-pointer list-none text-[12px] font-semibold text-foreground outline-none transition-colors hover:text-primary">
            Don&apos;t know where to find your Marketplace SKU? Here&apos;s a quick guide.
            <span className="ml-2 text-muted-foreground group-open:hidden">Show guides</span>
            <span className="ml-2 hidden text-muted-foreground group-open:inline">Hide guides</span>
          </summary>
          <div className="mt-3 grid gap-3 lg:grid-cols-3">
            {[
              {
                title: "Meesho",
                steps: "Login -> Inventory -> Bulk Stock Update -> Download Existing Inventory File -> Copy all SKU -> Paste into Sample File",
              },
              {
                title: "Flipkart",
                steps: "Login -> Listings/Inventory -> Bulk Actions -> Export Listings Report -> Copy all SKU -> Paste into Sample File",
              },
              {
                title: "Amazon",
                steps: "Login -> Inventory -> Manage All Inventory -> Export Inventory Report -> Copy all SKU -> Paste into Sample File",
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
