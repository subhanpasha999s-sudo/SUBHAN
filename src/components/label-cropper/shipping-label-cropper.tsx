"use client";

import * as React from "react";
import {
  Archive,
  Check,
  Download,
  FileText,
  Image as ImageIcon,
  Loader2,
  Maximize2,
  MousePointer2,
  Scissors,
  Upload,
} from "lucide-react";
import { toast as notify } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  analyzeCropperPdf,
  clampCropRect,
  cropEntriesToPdf,
  cropRectForPage,
  renderCropperPagePreview,
  zipCroppedPdfs,
  type CropExportEntry,
  type CropMode,
  type CropperDocument,
  type CropperMarketplace,
  type CropperPage,
  type CropRect,
} from "@/lib/label-cropper/shipping-label-cropper";
import {
  triggerPdfDownload,
  triggerZipDownload,
} from "@/lib/meesho-label-export/export-selected-pages";
import { cn } from "@/lib/utils";

type PageRef = {
  doc: CropperDocument;
  page: CropperPage;
};

type DragState =
  | { type: "move"; startX: number; startY: number; startRect: CropRect }
  | { type: "resize"; startX: number; startY: number; startRect: CropRect };

const MARKETPLACES: { key: CropperMarketplace; label: string }[] = [
  { key: "auto", label: "Auto Detect" },
  { key: "meesho", label: "Meesho" },
  { key: "flipkart", label: "Flipkart" },
  { key: "amazon", label: "Amazon" },
];

const CROP_MODES: { key: CropMode; label: string; hint: string }[] = [
  { key: "shipping", label: "Shipping labels", hint: "Labels only" },
  { key: "invoice", label: "Invoices", hint: "Invoice pages or sections" },
  { key: "both", label: "Label + invoice", hint: "Matched where possible" },
  { key: "full", label: "Full page", hint: "No section crop" },
];

function pageKey(ref: PageRef) {
  return `${ref.doc.id}:${ref.page.pageIndex}`;
}

function cropKey(ref: PageRef) {
  return `${ref.doc.id}:${ref.page.pageIndex}`;
}

function sanitizeFileName(value: string) {
  return value
    .replace(/\.pdf$/i, "")
    .replace(/[^a-z0-9._-]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "cropped-label";
}

function marketplaceLabel(page: CropperPage) {
  if (page.marketplace === "meesho") return "Meesho";
  if (page.marketplace === "flipkart") return "Flipkart";
  if (page.marketplace === "amazon") return "Amazon";
  return "Unknown";
}

function pageKindLabel(page: CropperPage) {
  if (page.kind === "shipping") return "Shipping";
  if (page.kind === "invoice") return "Invoice";
  if (page.kind === "combined") return "Label + invoice";
  return "Page";
}

function shouldShowPage(page: CropperPage, marketplace: CropperMarketplace, mode: CropMode) {
  if (marketplace !== "auto" && page.marketplace !== marketplace) return false;
  if (mode === "shipping") return page.kind !== "invoice";
  if (mode === "invoice") return page.kind !== "shipping";
  if (mode === "both") return page.kind !== "invoice" || page.pairedShippingPageIndex == null;
  return true;
}

function pageSummary(page: CropperPage) {
  const parts = [
    marketplaceLabel(page),
    pageKindLabel(page),
    page.orderId ? `Order ${page.orderId}` : "",
    page.sku ? `SKU ${page.sku}` : "",
    page.quantity != null ? `Qty ${page.quantity}` : "",
    page.awb ? `AWB ${page.awb}` : "",
  ].filter(Boolean);
  return parts.join(" · ");
}

export function ShippingLabelCropper({
  initialDocs,
  embedded = false,
}: {
  initialDocs?: CropperDocument[];
  embedded?: boolean;
}) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const previewWrapRef = React.useRef<HTMLDivElement>(null);
  const [docs, setDocs] = React.useState<CropperDocument[]>([]);
  const [selected, setSelected] = React.useState<Record<string, true>>({});
  const [marketplace, setMarketplace] = React.useState<CropperMarketplace>("auto");
  const [cropMode, setCropMode] = React.useState<CropMode>("shipping");
  const [applySameCrop, setApplySameCrop] = React.useState(true);
  const [individualZip, setIndividualZip] = React.useState(true);
  const [activeKey, setActiveKey] = React.useState("");
  const [previewUrl, setPreviewUrl] = React.useState("");
  const [previewBusy, setPreviewBusy] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [dragActive, setDragActive] = React.useState(false);
  const [previewCrop, setPreviewCrop] = React.useState(false);
  const [savedCropPulse, setSavedCropPulse] = React.useState(false);
  const [sameCropRect, setSameCropRect] = React.useState<CropRect | null>(null);
  const [pageCrops, setPageCrops] = React.useState<Record<string, CropRect>>({});
  const dragRef = React.useRef<DragState | null>(null);

  React.useEffect(() => {
    if (!initialDocs) return;
    setDocs(initialDocs);
    const refs = initialDocs.flatMap((doc) => doc.pages.map((page) => ({ doc, page })));
    const initial: Record<string, true> = {};
    for (const ref of refs) initial[pageKey(ref)] = true;
    setSelected(initial);
    setActiveKey(refs[0] ? pageKey(refs[0]) : "");
    setSameCropRect(null);
    setPageCrops({});
  }, [initialDocs]);

  const allPages = React.useMemo<PageRef[]>(() => {
    return docs.flatMap((doc) => doc.pages.map((page) => ({ doc, page })));
  }, [docs]);

  const visiblePages = React.useMemo(
    () => allPages.filter((ref) => shouldShowPage(ref.page, marketplace, cropMode)),
    [allPages, marketplace, cropMode]
  );

  const activeRef = React.useMemo(() => {
    return visiblePages.find((ref) => pageKey(ref) === activeKey) ?? visiblePages[0] ?? null;
  }, [activeKey, visiblePages]);

  const currentRect = React.useMemo(() => {
    if (!activeRef) return null;
    if (applySameCrop) {
      return sameCropRect ?? cropRectForPage(activeRef.page, cropMode);
    }
    return pageCrops[cropKey(activeRef)] ?? cropRectForPage(activeRef.page, cropMode);
  }, [activeRef, applySameCrop, cropMode, pageCrops, sameCropRect]);

  React.useEffect(() => {
    if (!activeRef) {
      setPreviewUrl("");
      return;
    }
    let cancelled = false;
    setPreviewBusy(true);
    renderCropperPagePreview(activeRef.doc, activeRef.page.pageIndex)
      .then((url) => {
        if (!cancelled) setPreviewUrl(url);
      })
      .catch((err) => {
        if (!cancelled) {
          setPreviewUrl("");
          notify.error(err instanceof Error ? err.message : "Could not render preview.");
        }
      })
      .finally(() => {
        if (!cancelled) setPreviewBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeRef]);

  React.useEffect(() => {
    setSelected((prev) => {
      const next: Record<string, true> = {};
      for (const ref of visiblePages) {
        const key = pageKey(ref);
        if (prev[key] || Object.keys(prev).length === 0) next[key] = true;
      }
      return next;
    });
    if (visiblePages.length > 0 && !visiblePages.some((ref) => pageKey(ref) === activeKey)) {
      setActiveKey(pageKey(visiblePages[0]));
    }
  }, [activeKey, visiblePages]);

  async function ingestFiles(files: FileList | File[]) {
    const pdfs = Array.from(files).filter((f) => /\.pdf$/i.test(f.name) || f.type === "application/pdf");
    if (pdfs.length === 0) {
      notify.error("Upload at least one PDF.");
      return;
    }
    setBusy(true);
    try {
      const parsed = await Promise.all(pdfs.map((file) => analyzeCropperPdf(file)));
      setDocs(parsed);
      const refs = parsed.flatMap((doc) => doc.pages.map((page) => ({ doc, page })));
      const initial: Record<string, true> = {};
      for (const ref of refs) initial[pageKey(ref)] = true;
      setSelected(initial);
      setActiveKey(refs[0] ? pageKey(refs[0]) : "");
      setSameCropRect(null);
      setPageCrops({});
      notify.success(`${parsed.reduce((sum, doc) => sum + doc.pageCount, 0).toLocaleString()} pages loaded.`);
    } catch (err) {
      notify.error(err instanceof Error ? err.message : "Could not read PDF.");
    } finally {
      setBusy(false);
      setDragActive(false);
    }
  }

  function selectedRefs() {
    return visiblePages.filter((ref) => selected[pageKey(ref)]);
  }

  function rectFor(ref: PageRef, mode: CropMode) {
    if (applySameCrop) return sameCropRect ?? cropRectForPage(ref.page, mode);
    return pageCrops[cropKey(ref)] ?? cropRectForPage(ref.page, mode);
  }

  function entriesForRef(ref: PageRef): CropExportEntry[] {
    const baseName = `${sanitizeFileName(ref.doc.fileName)}-p${ref.page.pageNumber}`;
    if (cropMode === "full") {
      return [{ doc: ref.doc, pageIndex: ref.page.pageIndex, rect: ref.page.defaultFullRect, fileName: `${baseName}-full.pdf` }];
    }
    if (cropMode === "shipping") {
      return [{ doc: ref.doc, pageIndex: ref.page.pageIndex, rect: rectFor(ref, "shipping"), fileName: `${baseName}-shipping.pdf` }];
    }
    if (cropMode === "invoice") {
      return [{ doc: ref.doc, pageIndex: ref.page.pageIndex, rect: rectFor(ref, "invoice"), fileName: `${baseName}-invoice.pdf` }];
    }

    if (ref.page.marketplace === "amazon" && ref.page.kind === "shipping" && ref.page.pairedInvoicePageIndex != null) {
      return [
        { doc: ref.doc, pageIndex: ref.page.pageIndex, rect: ref.page.defaultFullRect, fileName: `${baseName}-shipping.pdf` },
        { doc: ref.doc, pageIndex: ref.page.pairedInvoicePageIndex, rect: ref.page.defaultFullRect, fileName: `${baseName}-invoice.pdf` },
      ];
    }
    if (ref.page.kind === "combined") {
      return [
        { doc: ref.doc, pageIndex: ref.page.pageIndex, rect: ref.page.defaultShippingRect, fileName: `${baseName}-shipping.pdf` },
        { doc: ref.doc, pageIndex: ref.page.pageIndex, rect: ref.page.defaultInvoiceRect, fileName: `${baseName}-invoice.pdf` },
      ];
    }
    return [{ doc: ref.doc, pageIndex: ref.page.pageIndex, rect: rectFor(ref, "full"), fileName: `${baseName}.pdf` }];
  }

  function buildEntries() {
    return selectedRefs().flatMap(entriesForRef);
  }

  async function downloadSelected() {
    const entries = buildEntries();
    if (entries.length === 0) {
      notify.error("Select at least one page.");
      return;
    }
    setBusy(true);
    try {
      const pdf = await cropEntriesToPdf(entries);
      triggerPdfDownload(pdf, "tulmin-cropped-labels.pdf");
      notify.success("Cropped PDF downloaded.");
    } catch (err) {
      notify.error(err instanceof Error ? err.message : "Could not crop PDF.");
    } finally {
      setBusy(false);
    }
  }

  async function downloadZip() {
    const refs = selectedRefs();
    if (refs.length === 0) {
      notify.error("Select at least one page.");
      return;
    }
    setBusy(true);
    try {
      const groups = individualZip
        ? refs.map((ref) => ({
            fileName: `${sanitizeFileName(ref.doc.fileName)}-p${ref.page.pageNumber}.pdf`,
            entries: entriesForRef(ref),
          }))
        : [{ fileName: "tulmin-cropped-labels.pdf", entries: buildEntries() }];
      const zip = await zipCroppedPdfs(groups);
      triggerZipDownload(zip, "tulmin-cropped-labels.zip");
      notify.success("ZIP downloaded.");
    } catch (err) {
      notify.error(err instanceof Error ? err.message : "Could not build ZIP.");
    } finally {
      setBusy(false);
    }
  }

  function updateCurrentRect(rect: CropRect) {
    const next = clampCropRect(rect);
    if (applySameCrop) setSameCropRect(next);
    else if (activeRef) setPageCrops((prev) => ({ ...prev, [cropKey(activeRef)]: next }));
  }

  function pointerToNorm(event: React.PointerEvent) {
    const el = previewWrapRef.current;
    if (!el) return null;
    const box = el.getBoundingClientRect();
    return {
      x: (event.clientX - box.left) / box.width,
      y: (event.clientY - box.top) / box.height,
    };
  }

  function onPointerMove(event: React.PointerEvent) {
    if (!dragRef.current || !currentRect) return;
    const p = pointerToNorm(event);
    if (!p) return;
    const dx = p.x - dragRef.current.startX;
    const dy = p.y - dragRef.current.startY;
    if (dragRef.current.type === "move") {
      updateCurrentRect({
        ...dragRef.current.startRect,
        x: dragRef.current.startRect.x + dx,
        y: dragRef.current.startRect.y + dy,
      });
      return;
    }
    updateCurrentRect({
      ...dragRef.current.startRect,
      width: dragRef.current.startRect.width + dx,
      height: dragRef.current.startRect.height + dy,
    });
  }

  function saveCrop() {
    if (!currentRect) return;
    updateCurrentRect(currentRect);
    setSavedCropPulse(true);
    window.setTimeout(() => setSavedCropPulse(false), 900);
    notify.success(applySameCrop ? "Crop saved for all pages." : "Crop saved for this page.");
  }

  const selectedCount = selectedRefs().length;

  return (
    <section className="space-y-4">
      {!embedded ? (
      <div
        className={cn(
          "rounded-2xl border border-dashed border-border bg-muted/12 p-4 transition-colors dark:bg-muted/8 sm:p-5",
          dragActive && "border-primary/60 bg-primary/[0.06]"
        )}
        onDragEnter={(e) => {
          e.preventDefault();
          setDragActive(true);
        }}
        onDragOver={(e) => e.preventDefault()}
        onDragLeave={(e) => {
          if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
          setDragActive(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          void ingestFiles(e.dataTransfer.files);
        }}
      >
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          accept="application/pdf,.pdf"
          multiple
          onChange={(e) => {
            if (e.target.files) void ingestFiles(e.target.files);
            e.target.value = "";
          }}
        />
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-border bg-background/80 text-primary shadow-inner">
              <Scissors className="size-5" aria-hidden />
            </span>
            <div className="min-w-0">
              <h1 className="text-[18px] font-semibold tracking-tight text-foreground sm:text-xl">
                Shipping Label Cropper
              </h1>
              <p className="mt-1 text-[12px] font-medium text-muted-foreground sm:text-[13px]">
                Upload Meesho, Flipkart, or Amazon PDFs. Crop labels as clear PDF output.
              </p>
            </div>
          </div>
          <Button
            type="button"
            className="h-10 rounded-xl px-4 text-[12px] font-semibold"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
          >
            {busy ? <Loader2 className="mr-1.5 size-3.5 animate-spin" aria-hidden /> : <Upload className="mr-1.5 size-3.5" aria-hidden />}
            Upload PDFs
          </Button>
        </div>
      </div>
      ) : null}

      {docs.length > 0 ? (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
          <div className="min-w-0 rounded-2xl border border-border/65 bg-card/80 p-3 shadow-elevate-xs sm:p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[13px] font-semibold text-foreground">
                  {activeRef ? `Page ${activeRef.page.pageNumber}` : "Preview"}
                </p>
                <p className="mt-0.5 truncate text-[11px] font-medium text-muted-foreground">
                  {activeRef ? pageSummary(activeRef.page) : "Upload a PDF to start."}
                </p>
              </div>
              <div className="flex items-center gap-2 text-[11px] font-medium text-muted-foreground">
                <MousePointer2 className="size-3.5" aria-hidden />
                Drag crop box
              </div>
            </div>

            <div className="relative mx-auto max-h-[68dvh] min-h-[18rem] overflow-auto rounded-xl border border-border/55 bg-muted/25 p-3">
              {previewBusy ? (
                <div className="flex min-h-[18rem] items-center justify-center text-muted-foreground">
                  <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />
                  Rendering preview
                </div>
              ) : previewUrl && currentRect ? (
                <div
                  ref={previewWrapRef}
                  className={cn(
                    "relative mx-auto overflow-hidden bg-white shadow-elevate-sm",
                    previewCrop && "ring-2 ring-primary/60"
                  )}
                  style={{ width: "min(100%, 720px)" }}
                  onPointerMove={onPointerMove}
                  onPointerUp={(event) => {
                    dragRef.current = null;
                    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                      event.currentTarget.releasePointerCapture(event.pointerId);
                    }
                  }}
                  onPointerCancel={() => {
                    dragRef.current = null;
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- pdf.js renders a local data URL preview. */}
                  <img src={previewUrl} alt="PDF page preview" className="block w-full select-none" draggable={false} />
                  <div
                    className={cn(
                      "absolute border-2 border-primary bg-primary/10 shadow-[0_0_0_9999px_rgb(0_0_0/0.36)]",
                      savedCropPulse && "border-emerald-400"
                    )}
                    style={{
                      left: `${currentRect.x * 100}%`,
                      top: `${currentRect.y * 100}%`,
                      width: `${currentRect.width * 100}%`,
                      height: `${currentRect.height * 100}%`,
                    }}
                    onPointerDown={(event) => {
                      const p = pointerToNorm(event);
                      if (!p) return;
                      previewWrapRef.current?.setPointerCapture(event.pointerId);
                      dragRef.current = {
                        type: "move",
                        startX: p.x,
                        startY: p.y,
                        startRect: currentRect,
                      };
                    }}
                  >
                    <button
                      type="button"
                      aria-label="Resize crop"
                      className="absolute -bottom-2 -right-2 flex size-6 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm"
                      onPointerDown={(event) => {
                        const p = pointerToNorm(event);
                        if (!p) return;
                        event.stopPropagation();
                        previewWrapRef.current?.setPointerCapture(event.pointerId);
                        dragRef.current = {
                          type: "resize",
                          startX: p.x,
                          startY: p.y,
                          startRect: currentRect,
                        };
                      }}
                    >
                      <Maximize2 className="size-3.5" aria-hidden />
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex min-h-[18rem] items-center justify-center text-muted-foreground">
                  <ImageIcon className="mr-2 size-4" aria-hidden />
                  No preview
                </div>
              )}
            </div>

            <div className="mt-3 flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {visiblePages.map((ref) => {
                const key = pageKey(ref);
                const active = activeRef && key === pageKey(activeRef);
                return (
                  <button
                    key={key}
                    type="button"
                    className={cn(
                      "min-w-[8rem] rounded-xl border px-3 py-2 text-left text-[11px] transition-colors",
                      active
                        ? "border-primary bg-primary/10 text-foreground"
                        : "border-border/65 bg-background/55 text-muted-foreground hover:bg-muted/45"
                    )}
                    onClick={() => setActiveKey(key)}
                  >
                    <span className="block font-semibold text-foreground">Page {ref.page.pageNumber}</span>
                    <span className="mt-0.5 block truncate">{marketplaceLabel(ref.page)} · {pageKindLabel(ref.page)}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <aside className="space-y-3 rounded-2xl border border-border/65 bg-card/80 p-4 shadow-elevate-xs">
            <div>
              <p className="text-[13px] font-semibold text-foreground">Marketplace</p>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {MARKETPLACES.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    className={cn(
                      "h-9 rounded-xl border px-2 text-[12px] font-semibold transition-colors",
                      marketplace === item.key
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border/65 bg-background/55 text-muted-foreground hover:bg-muted/45 hover:text-foreground"
                    )}
                    onClick={() => setMarketplace(item.key)}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="text-[13px] font-semibold text-foreground">Crop option</p>
              <div className="mt-2 grid gap-2">
                {CROP_MODES.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    className={cn(
                      "rounded-xl border px-3 py-2 text-left transition-colors",
                      cropMode === item.key
                        ? "border-primary bg-primary/10 text-foreground ring-1 ring-primary/15"
                        : "border-border/65 bg-background/55 text-muted-foreground hover:bg-muted/45 hover:text-foreground"
                    )}
                    onClick={() => {
                      setCropMode(item.key);
                      setSameCropRect(null);
                    }}
                  >
                    <span className="block text-[12px] font-semibold">{item.label}</span>
                    <span className="mt-0.5 block text-[11px] text-muted-foreground">{item.hint}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2 rounded-xl border border-border/60 bg-muted/18 p-3">
              <label className="flex items-center gap-2 text-[12px] font-semibold text-foreground">
                <Checkbox checked={applySameCrop} onCheckedChange={(v) => setApplySameCrop(Boolean(v))} />
                Apply same crop to all pages
              </label>
              <label className="flex items-center gap-2 text-[12px] font-semibold text-foreground">
                <Checkbox checked={individualZip} onCheckedChange={(v) => setIndividualZip(Boolean(v))} />
                Crop each label individually in ZIP
              </label>
            </div>

            <div className="rounded-xl border border-border/60 bg-muted/18 p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-[13px] font-semibold text-foreground">Pages</p>
                <span className="text-[11px] font-medium tabular-nums text-muted-foreground">
                  {selectedCount} selected
                </span>
              </div>
              <div className="max-h-48 space-y-1.5 overflow-y-auto pr-1">
                {visiblePages.map((ref) => {
                  const key = pageKey(ref);
                  return (
                    <label
                      key={key}
                      className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-[12px] hover:bg-muted/40"
                    >
                      <Checkbox
                        checked={Boolean(selected[key])}
                        onCheckedChange={(v) =>
                          setSelected((prev) => {
                            const next = { ...prev };
                            if (v) next[key] = true;
                            else delete next[key];
                            return next;
                          })
                        }
                      />
                      <span className="min-w-0 flex-1 truncate">
                        Page {ref.page.pageNumber} · {pageKindLabel(ref.page)}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="grid gap-2">
              <Button
                type="button"
                variant="outline"
                className="h-10 rounded-xl text-[12px] font-semibold"
                onClick={() => setPreviewCrop((v) => !v)}
              >
                <FileText className="mr-1.5 size-3.5" aria-hidden />
                Preview Crop
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-10 rounded-xl text-[12px] font-semibold"
                disabled={!currentRect}
                onClick={saveCrop}
              >
                <Check className="mr-1.5 size-3.5" aria-hidden />
                Save Crop
              </Button>
              <Button
                type="button"
                className="h-10 rounded-xl text-[12px] font-semibold"
                disabled={busy || selectedCount === 0}
                onClick={() => void downloadSelected()}
              >
                {busy ? <Loader2 className="mr-1.5 size-3.5 animate-spin" aria-hidden /> : <Download className="mr-1.5 size-3.5" aria-hidden />}
                Download Selected
              </Button>
              <Button
                type="button"
                className="h-10 rounded-xl text-[12px] font-semibold"
                disabled={busy || selectedCount === 0}
                onClick={() => void downloadZip()}
              >
                {busy ? <Loader2 className="mr-1.5 size-3.5 animate-spin" aria-hidden /> : <Archive className="mr-1.5 size-3.5" aria-hidden />}
                Download ZIP
              </Button>
            </div>
          </aside>
        </div>
      ) : null}
    </section>
  );
}
