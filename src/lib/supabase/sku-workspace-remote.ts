"use client";

import type { SkuMappingWorkspaceRecord } from "@/types/sku-workspace";

import { getSkuMapAuthContext } from "@/lib/supabase/sku-map-remote";

function parseListingSkus(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((x) => typeof x === "string") as string[];
}

function rowFromDb(raw: Record<string, unknown>): SkuMappingWorkspaceRecord | null {
  const uid = raw.user_id;
  const ws = raw.workspace_id;
  if (typeof uid !== "string" || typeof ws !== "string") return null;
  return {
    user_id: uid,
    workspace_id: ws,
    file_name: typeof raw.file_name === "string" ? raw.file_name : "",
    uploaded_at:
      typeof raw.uploaded_at === "string"
        ? raw.uploaded_at
        : new Date(0).toISOString(),
    updated_at:
      typeof raw.updated_at === "string"
        ? raw.updated_at
        : new Date(0).toISOString(),
    listing_skus: parseListingSkus(raw.listing_skus),
    column_used:
      typeof raw.column_used === "string" ? raw.column_used : null,
    scanned_rows:
      typeof raw.scanned_rows === "number" && Number.isFinite(raw.scanned_rows)
        ? raw.scanned_rows
        : 0,
    revision:
      typeof raw.revision === "number" && Number.isFinite(raw.revision)
        ? raw.revision
        : 1,
  };
}

/** Load the signed-in user's workspace listing set (single row per user). */
export async function fetchSkuMappingWorkspace(): Promise<{
  ok: boolean;
  message: string;
  workspace?: SkuMappingWorkspaceRecord;
}> {
  const auth = await getSkuMapAuthContext();
  if (!auth.ok) return { ok: false, message: auth.message };
  const { sb } = auth;

  const { data, error } = await sb
    .from("sku_mapping_workspace")
    .select(
      "user_id,workspace_id,file_name,uploaded_at,updated_at,listing_skus,column_used,scanned_rows,revision"
    )
    .maybeSingle();

  if (error)
    return { ok: false, message: error.message };

  if (!data)
    return { ok: true, message: "No workspace.", workspace: undefined };

  const w = rowFromDb(data as Record<string, unknown>);
  if (!w) return { ok: false, message: "Invalid workspace shape." };

  return { ok: true, message: "OK", workspace: w };
}

/** Replace listing import + metadata (PK = user_id). Preserves workspace_id when provided. */
export async function upsertSkuMappingWorkspace(input: {
  workspaceId?: string;
  fileName: string;
  uploadedAt?: string;
  listingSkus: string[];
  columnUsed: string | null;
  scannedRows: number;
}): Promise<{ ok: boolean; message: string; workspace?: SkuMappingWorkspaceRecord }> {
  const auth = await getSkuMapAuthContext();
  if (!auth.ok) return { ok: false, message: auth.message };
  const { sb, userId } = auth;

  const workspace_id =
    input.workspaceId?.trim() ||
    (typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `ws-${Date.now()}`);

  const uploaded_at = input.uploadedAt ?? new Date().toISOString();
  const now = new Date().toISOString();

  const payload = {
    user_id: userId,
    workspace_id,
    file_name: input.fileName,
    uploaded_at,
    listing_skus: input.listingSkus,
    column_used: input.columnUsed,
    scanned_rows: input.scannedRows,
    updated_at: now,
  };

  const { data, error } = await sb
    .from("sku_mapping_workspace")
    .upsert(payload, { onConflict: "user_id" })
    .select(
      "user_id,workspace_id,file_name,uploaded_at,updated_at,listing_skus,column_used,scanned_rows,revision"
    )
    .maybeSingle();

  if (error) return { ok: false, message: error.message };

  const w = data
    ? rowFromDb(data as Record<string, unknown>)
    : null;
  if (!w)
    return {
      ok: false,
      message: "Workspace saved but shape was not returned.",
    };

  return { ok: true, message: "Workspace saved.", workspace: w };
}

export async function deleteSkuMappingWorkspace(): Promise<{
  ok: boolean;
  message: string;
}> {
  const auth = await getSkuMapAuthContext();
  if (!auth.ok) return { ok: false, message: auth.message };
  const { sb, userId } = auth;

  const { error } = await sb
    .from("sku_mapping_workspace")
    .delete()
    .eq("user_id", userId);
  if (error) return { ok: false, message: error.message };
  return { ok: true, message: "Workspace removed." };
}
