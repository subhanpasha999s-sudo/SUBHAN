"use client";

import type { SkuMappingRow } from "@/types/label";

import {
  deriveSkuMappingRows,
  fetchSkuMapSnapshot,
  getSkuMapAuthContext,
} from "@/lib/supabase/sku-map-remote";

export async function pushMappingsRemote(
  rows: SkuMappingRow[]
): Promise<{ ok: boolean; message: string }> {
  const auth = await getSkuMapAuthContext();
  if (!auth.ok) return { ok: false, message: auth.message };
  const { sb, userId } = auth;

  const masterNames = [
    ...new Set(rows.map((r) => r.masterSku.trim()).filter(Boolean)),
  ];

  if (masterNames.length > 0) {
    const payload = masterNames.map((name) => ({ name, user_id: userId }));
    const { error: me } = await sb.from("master_skus").upsert(payload, {
      onConflict: "user_id,name",
      ignoreDuplicates: false,
    });
    if (me) return { ok: false, message: me.message };
  }

  const { data: masters, error: eM } = await sb
    .from("master_skus")
    .select("id,name")
    .eq("user_id", userId);

  if (eM) return { ok: false, message: eM.message };

  const nameToId = new Map(
    (masters ?? []).map((m: { id: string; name: string }) => [
      m.name.trim(),
      m.id,
    ])
  );

  const skuPayload = rows.map((r) => {
    const listing = r.meeshoSku.trim();
    const mname = r.masterSku.trim();
    return {
      listing_sku: listing,
      master_sku_id: mname ? (nameToId.get(mname) ?? null) : null,
      category: r.category ?? "",
      user_id: userId,
    };
  });

  const { error: eU } = await sb.from("sku_map").upsert(skuPayload, {
    onConflict: "user_id,listing_sku",
    ignoreDuplicates: false,
  });

  if (eU) return { ok: false, message: eU.message };
  return { ok: true, message: `${rows.length.toLocaleString()} row(s) synced.` };
}

export async function pullMappingsRemote(): Promise<{
  ok: boolean;
  message: string;
  rows?: SkuMappingRow[];
}> {
  const snap = await fetchSkuMapSnapshot();
  if (!snap.ok || !snap.masters || !snap.skuMap)
    return { ok: false, message: snap.message };

  const rows = deriveSkuMappingRows(snap.masters, snap.skuMap);
  return {
    ok: true,
    message: `${rows.length.toLocaleString()} row(s) loaded.`,
    rows,
  };
}
