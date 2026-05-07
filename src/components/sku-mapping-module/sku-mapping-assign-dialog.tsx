"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { MasterSkuRecord } from "@/types/sku-map";

export interface SkuMappingAssignDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  masters: MasterSkuRecord[];
  busy: boolean;
  /** When opening from “Create new SKU”, force typed name path */
  defaultMode?: "existing" | "new";
  onConfirm: (opts: { masterName: string }) => Promise<void>;
}

export function SkuMappingAssignDialog({
  open,
  onOpenChange,
  title,
  description,
  masters,
  busy,
  defaultMode,
  onConfirm,
}: SkuMappingAssignDialogProps) {
  const [mode, setMode] = React.useState<"existing" | "new">("existing");
  const [pickedId, setPickedId] = React.useState<string>("");
  const [typed, setTyped] = React.useState("");

  React.useEffect(() => {
    if (!open) return;
    const initial =
      defaultMode ?? (masters.length > 0 ? "existing" : "new");
    setMode(initial);
    setPickedId("");
    setTyped("");
  }, [open, masters.length, defaultMode]);

  const resolvedMasterName =
    masters.length === 0 || mode === "new"
      ? typed.trim()
      : masters.find((x) => x.id === pickedId)?.name.trim() ?? "";

  const canSave = resolvedMasterName.length > 0 && !busy;

  async function submit() {
    if (!canSave) return;
    try {
      await onConfirm({ masterName: resolvedMasterName });
      onOpenChange(false);
    } catch {
      /* Stay open so the user can fix input or retry */
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="max-w-md border-[#dfe6ef] bg-white">
        <DialogHeader>
          <DialogTitle className="text-[#17324d]">{title}</DialogTitle>
          {description ? (
            <DialogDescription className="text-[13px] text-[#62788a]">
              {description}
            </DialogDescription>
          ) : null}
        </DialogHeader>

        <div className="space-y-3 py-1">
          {masters.length > 0 ? (
            <div className="space-y-1">
              <Label className="text-xs text-[#475569]">Source</Label>
              <Select
                value={mode}
                onValueChange={(v) => setMode(v as "existing" | "new")}
                disabled={busy}
              >
                <SelectTrigger className="h-9 border-[#c9d9ec] bg-white text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="existing">Existing SKU</SelectItem>
                  <SelectItem value="new">Type new name</SelectItem>
                </SelectContent>
              </Select>
            </div>
          ) : null}

          {mode === "existing" && masters.length > 0 ? (
            <div className="space-y-1">
              <Label className="text-xs text-[#475569]">SKU</Label>
              <Select
                value={pickedId}
                onValueChange={(v) => {
                  if (v != null && v !== "") setPickedId(v);
                }}
                disabled={busy}
              >
                <SelectTrigger className="h-9 border-[#c9d9ec] bg-white text-xs [&_[data-slot=select-value]]:truncate">
                  <SelectValue placeholder="Choose…" />
                </SelectTrigger>
                <SelectContent className="max-h-[280px]">
                  {masters.map((m) => (
                    <SelectItem key={m.id} value={m.id} className="text-xs">
                      <span className="font-medium">{m.name}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <div className="space-y-1">
              <Label htmlFor="sku-map-master-name" className="text-xs text-[#475569]">
                SKU name
              </Label>
              <Input
                id="sku-map-master-name"
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                placeholder="e.g. KURTI_RED_FAMILY"
                className="h-9 border-[#c9d9ec] font-mono text-sm"
                disabled={busy}
                list="sku-map-assign-master-datalist"
              />
              <datalist id="sku-map-assign-master-datalist">
                {masters.map((m) => (
                  <option key={m.id} value={m.name} />
                ))}
              </datalist>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:justify-end">
          <Button
            type="button"
            variant="outline"
            className="border-[#c9d9ec]"
            disabled={busy}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            className="bg-[#1868DB] font-semibold hover:bg-[#1356b8]"
            disabled={!canSave}
            onClick={() => void submit()}
          >
            {busy ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />
                Syncing Tulmin workspace…
              </>
            ) : (
              "Save mapping"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
