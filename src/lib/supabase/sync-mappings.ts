"use client";

import type { SkuMappingRow } from "@/types/label";

import {
  deriveSkuMappingRows,
  fetchSkuMapSnapshot,
  getSkuMapAuthContext,
} from "@/lib/supabase/sku-map-remote";

function isMissingUserIdColumnError(message: string | undefined): boolean {
  if (!message) return false;
  return (
    message.includes("Could not find the 'user_id' column") ||
    message.includes('column "user_id" does not exist')
  );
}

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
    let { error: me } = await sb.from("master_skus").upsert(payload, {
      onConflict: "user_id,name",
      ignoreDuplicates: false,
    });
    if (me && isMissingUserIdColumnError(me.message)) {
      const legacyPayload = masterNames.map((name) => ({ name }));
      const legacy = await sb.from("master_skus").upsert(legacyPayload, {
        onConflict: "name",
        ignoreDuplicates: false,
      });
      me = legacy.error;
    }
    if (me) return { ok: false, message: me.message };
  }

  let { data: masters, error: eM } = await sb
    .from("master_skus")
    .select("id,name")
    .eq("user_id", userId);
  if (eM && isMissingUserIdColumnError(eM.message)) {
    const legacy = await sb.from("master_skus").select("id,name");
    masters = legacy.data;
    eM = legacy.error;
  }

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

  let { error: eU } = await sb.from("sku_map").upsert(skuPayload, {
    onConflict: "user_id,listing_sku",
    ignoreDuplicates: false,
  });
  if (eU && isMissingUserIdColumnError(eU.message)) {
    const legacyPayload = rows.map((r) => {
      const listing = r.meeshoSku.trim();
      const mname = r.masterSku.trim();
      return {
        listing_sku: listing,
        master_sku_id: mname ? (nameToId.get(mname) ?? null) : null,
        category: r.category ?? "",
      };
    });
    const legacy = await sb.from("sku_map").upsert(legacyPayload, {
      onConflict: "listing_sku",
      ignoreDuplicates: false,
    });
    eU = legacy.error;
  }

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
