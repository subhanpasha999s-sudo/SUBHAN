"use client";

import * as React from "react";
import { FileSpreadsheet, Loader2, Upload } from "lucide-react";

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
      <div className="flex flex-col items-center gap-3 px-6 py-9 text-center sm:flex-row sm:justify-between sm:gap-6 sm:text-left">
        <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-center sm:gap-5">
          <div
            className={cn(
              "flex size-14 shrink-0 items-center justify-center rounded-2xl border border-border bg-muted/50 shadow-inner",
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
            <p className="text-[17px] font-semibold tracking-tight text-foreground">
              Import listing SKUs
            </p>
            <p className="max-w-md text-[13px] leading-snug text-muted-foreground">
              Meesho-style sheet: SKUs in{" "}
              <span className="font-semibold text-foreground">column F</span>, starting{" "}
              <span className="font-semibold text-foreground">row 3</span> (rows 1–2
              skipped). CSV or Excel—drop or browse.
            </p>
          </div>
        </div>
        <Button
          type="button"
          size="lg"
          className="min-h-11 shrink-0 px-5 text-[13px] font-semibold sm:min-h-10"
          disabled={disabled || busy}
          onClick={() => inputRef.current?.click()}
        >
          <Upload className="mr-2 size-4" aria-hidden />
          Choose file
        </Button>
      </div>
    </div>
  );
}
