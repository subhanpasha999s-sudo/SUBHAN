"use client";

import * as React from "react";

import { ChevronDown, ChevronRight, Link2Off } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { MasterSkuRecord, SkuMapRecord } from "@/types/sku-map";

export interface MasterSkuCardProps {
  master: MasterSkuRecord;
  childrenRows: SkuMapRecord[];
  expanded: boolean;
  globalSearch: string;
  onToggleExpand: () => void;
  onUnmapListing: (listingSku: string) => void;
}

export function MasterSkuCard({
  master,
  childrenRows,
  expanded,
  globalSearch,
  onToggleExpand,
  onUnmapListing,
}: MasterSkuCardProps) {
  const q = globalSearch.trim().toLowerCase();
  const visibleChildren = React.useMemo(() => {
    if (!q) return childrenRows;
    return childrenRows.filter((r) =>
      `${r.listing_sku} ${r.category ?? ""}`.toLowerCase().includes(q)
    );
  }, [childrenRows, q]);

  return (
    <Card className="overflow-hidden border border-neutral-200 bg-white shadow-none">
      <div className="flex flex-wrap items-center gap-2 border-b border-neutral-100 bg-white px-2 py-1.5">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 w-7 shrink-0 p-0 text-neutral-500 hover:bg-neutral-100"
          aria-expanded={expanded}
          aria-label={expanded ? "Collapse children" : "Expand children"}
          onClick={onToggleExpand}
        >
          {expanded ? (
            <ChevronDown className="size-4" aria-hidden />
          ) : (
            <ChevronRight className="size-4" aria-hidden />
          )}
        </Button>
        <span className="min-w-0 flex-1 truncate font-mono text-xs font-medium text-neutral-900">
          {master.name}
        </span>
        <Badge
          variant="outline"
          className="border-neutral-200 bg-neutral-50 text-[10px] font-normal tabular-nums text-neutral-600"
        >
          {childrenRows.length.toLocaleString()}
        </Badge>
      </div>
      {expanded ? (
        <CardContent className="border-t border-neutral-100 p-0">
          {visibleChildren.length === 0 ? (
            <p className="px-3 py-4 text-center text-xs text-neutral-400">
              Nothing matches search.
            </p>
          ) : (
            <ScrollArea className="max-h-[min(240px,34vh)]">
              <ul className="divide-y divide-neutral-100">
                {visibleChildren.map((row) => (
                  <li
                    key={row.id}
                    className="flex items-center gap-2 px-2 py-1.5 hover:bg-neutral-50/80"
                  >
                    <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-neutral-800">
                      {row.listing_sku}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 shrink-0 px-2 text-[11px] text-neutral-500 hover:bg-neutral-100"
                      title="Remove mapping (listing stays in sku_map)"
                      onClick={() => onUnmapListing(row.listing_sku)}
                    >
                      <Link2Off className="size-3 opacity-70" aria-hidden />
                      Unmap
                    </Button>
                  </li>
                ))}
              </ul>
            </ScrollArea>
          )}
        </CardContent>
      ) : null}
    </Card>
  );
}
