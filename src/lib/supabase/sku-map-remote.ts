"use client";

/**
 * Listing ↔ master persistence lives in `public.sku_map` (listing_sku scoped by user_id,
 * upsert onConflict user_id,listing_sku). `master_skus` holds master definitions.
 * RLS restricts reads/writes to the signed-in user — this is the source of truth when online.
 */

import type { MasterSkuRecord, SkuMapRecord } from "@/types/sku-map";
import type { SkuMappingRow } from "@/types/label";

import { getSupabaseBrowser } from "@/lib/supabase/browser-client";
import { writeSkuMapSnapshotCache } from "@/lib/supabase/sku-map-snapshot-cache";

export type { MasterSkuRecord, SkuMapRecord };

function isMissingUserIdColumnError(message: string | undefined): boolean {
  if (!message) return false;
  return (
    message.includes("Could not find the 'user_id' column") ||
    message.includes('column "user_id" does not exist')
  );
}

type AuthOk = {
  ok: true;
  sb: NonNullable<ReturnType<typeof getSupabaseBrowser>>;
  userId: string;
};

type AuthFail = { ok: false; message: string };

async function requireSkuMapAuth(): Promise<AuthOk | AuthFail> {
  const sb = getSupabaseBrowser();
  if (!sb) return { ok: false, message: "Backend not configured." };
  const {
    data: { session },
  } = await sb.auth.getSession();
  const userId = session?.user?.id;
  if (!userId)
    return { ok: false, message: "Sign in to load or save SKU maps." };
  return { ok: true, sb, userId };
}

/** For integration helpers that need an authenticated client + user id. */
export async function getSkuMapAuthContext(): Promise<AuthOk | AuthFail> {
  return requireSkuMapAuth();
}

export function deriveSkuMappingRows(
  masters: MasterSkuRecord[],
  skuMap: SkuMapRecord[]
): SkuMappingRow[] {
  const byId = new Map(masters.map((m) => [m.id, m.name]));
  return skuMap.map((r) => ({
    id: r.id,
    meeshoSku: r.listing_sku,
    masterSku: r.master_sku_id ? (byId.get(r.master_sku_id) ?? "") : "",
    category: r.category ?? "",
    updatedAt: new Date(r.created_at).getTime(),
  }));
}

export async function fetchSkuMapSnapshot(): Promise<{
  ok: boolean;
  message: string;
  masters?: MasterSkuRecord[];
  skuMap?: SkuMapRecord[];
}> {
  const auth = await requireSkuMapAuth();
  if (!auth.ok) return { ok: false, message: auth.message };

  const { sb, userId } = auth;

  const { data: mastersRaw, error: e1 } = await sb
    .from("master_skus")
    .select("id,name,created_at,user_id")
    .order("name", { ascending: true });

  const { data: skuMapRaw, error: e2 } = await sb
    .from("sku_map")
    .select("id,listing_sku,master_sku_id,category,created_at,user_id")
    .order("listing_sku", { ascending: true });

  let masters = mastersRaw;
  let skuMap = skuMapRaw;
  if (e1 && isMissingUserIdColumnError(e1.message)) {
    const { data, error } = await sb
      .from("master_skus")
      .select("id,name,created_at")
      .order("name", { ascending: true });
    if (error) return { ok: false, message: error.message };
    masters = data;
  } else if (e1) {
    return { ok: false, message: e1.message };
  }

  if (e2 && isMissingUserIdColumnError(e2.message)) {
    const { data, error } = await sb
      .from("sku_map")
      .select("id,listing_sku,master_sku_id,category,created_at")
      .order("listing_sku", { ascending: true });
    if (error) return { ok: false, message: error.message };
    skuMap = data;
  } else if (e2) {
    return { ok: false, message: e2.message };
  }

  const m = (masters ?? []) as MasterSkuRecord[];
  const sm = (skuMap ?? []) as SkuMapRecord[];
  writeSkuMapSnapshotCache({ masters: m, skuMap: sm }, userId);

  return {
    ok: true,
    message: `${sm.length} listing row(s).`,
    masters: m,
    skuMap: sm,
  };
}

async function fetchMasterByName(
  sb: NonNullable<ReturnType<typeof getSupabaseBrowser>>,
  userId: string,
  exactName: string
): Promise<{ ok: boolean; message: string; master?: MasterSkuRecord }> {
  let { data, error } = await sb
    .from("master_skus")
    .select("id,name,created_at,user_id")
    .eq("user_id", userId)
    .eq("name", exactName)
    .maybeSingle();

  if (error && isMissingUserIdColumnError(error.message)) {
    const legacy = await sb
      .from("master_skus")
      .select("id,name,created_at")
      .eq("name", exactName)
      .maybeSingle();
    data = legacy.data;
    error = legacy.error;
  }

  if (error) return { ok: false, message: error.message };
  if (!data)
    return {
      ok: false,
      message: `No SKU named "${exactName}".`,
    };
  return {
    ok: true,
    message: "Loaded SKU.",
    master: data as MasterSkuRecord,
  };
}

export async function insertMasterSku(
  name: string
): Promise<{ ok: boolean; message: string; master?: MasterSkuRecord }> {
  const trimmed = name.trim();
  if (!trimmed)
    return { ok: false, message: "SKU name is required." };

  const auth = await requireSkuMapAuth();
  if (!auth.ok) return { ok: false, message: auth.message };
  const { sb, userId } = auth;

  let { data, error } = await sb
    .from("master_skus")
    .insert({ name: trimmed, user_id: userId })
    .select("id,name,created_at,user_id");

  if (error && isMissingUserIdColumnError(error.message)) {
    const legacy = await sb
      .from("master_skus")
      .insert({ name: trimmed })
      .select("id,name,created_at");
    data = legacy.data;
    error = legacy.error;
  }

  if (error) {
    if (error.code === "23505") {
      const got = await fetchMasterByName(sb, userId, trimmed);
      if (got.ok && got.master) {
        return {
          ok: true,
          master: got.master,
          message: "That SKU name already exists — selected it for mapping.",
        };
      }
      return {
        ok: false,
        message:
          got.message ||
          "Duplicate SKU name, but the existing row could not be read.",
      };
    }
    return {
      ok: false,
      message: error.message || "Could not create SKU.",
    };
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (row) {
    return {
      ok: true,
      message: "SKU created.",
      master: row as MasterSkuRecord,
    };
  }

  const got = await fetchMasterByName(sb, userId, trimmed);
  if (got.ok && got.master) {
    return {
      ok: true,
      master: got.master,
      message: "SKU created.",
    };
  }

  return {
    ok: false,
    message:
      got.message ||
      "Insert returned no row. Check sign-in and RLS policies.",
  };
}

export async function assignListingsToMasterRemote(
  masterId: string,
  listingSkus: string[]
): Promise<{ ok: boolean; message: string }> {
  if (!listingSkus.length)
    return { ok: false, message: "No listing SKUs selected." };

  const auth = await requireSkuMapAuth();
  if (!auth.ok) return { ok: false, message: auth.message };
  const { sb } = auth;

  const { error } = await sb
    .from("sku_map")
    .update({ master_sku_id: masterId })
    .in("listing_sku", listingSkus);

  if (error) return { ok: false, message: error.message };
  return {
    ok: true,
    message: `${listingSkus.length.toLocaleString()} SKU(s) mapped.`,
  };
}

export async function upsertListingsUnderMasterRemote(
  masterId: string,
  listingSkus: string[]
): Promise<{ ok: boolean; message: string }> {
  if (!listingSkus.length)
    return { ok: false, message: "No listing SKUs selected." };

  const auth = await requireSkuMapAuth();
  if (!auth.ok) return { ok: false, message: auth.message };
  const { sb, userId } = auth;

  const payload = listingSkus.map((listing_sku) => ({
    listing_sku,
    master_sku_id: masterId,
    category: "",
    user_id: userId,
  }));

  let { error } = await sb.from("sku_map").upsert(payload, {
    onConflict: "user_id,listing_sku",
    ignoreDuplicates: false,
  });
  if (error && isMissingUserIdColumnError(error.message)) {
    const legacyPayload = listingSkus.map((listing_sku) => ({
      listing_sku,
      master_sku_id: masterId,
      category: "",
    }));
    const legacy = await sb.from("sku_map").upsert(legacyPayload, {
      onConflict: "listing_sku",
      ignoreDuplicates: false,
    });
    error = legacy.error;
  }

  if (error) return { ok: false, message: error.message };
  return {
    ok: true,
    message: `${listingSkus.length.toLocaleString()} listing(s) linked to SKU.`,
  };
}

const SKU_MAP_UPSERT_CHUNK = 500;

export async function batchApplyMasterMappingsRemote(
  groups: { masterName: string; listingSkus: string[] }[]
): Promise<{ ok: boolean; message: string }> {
  const auth = await requireSkuMapAuth();
  if (!auth.ok) return { ok: false, message: auth.message };
  const { sb, userId } = auth;

  const normalized = groups
    .map((g) => ({
      masterName: g.masterName.trim(),
      listingSkus: [
        ...new Set(g.listingSkus.map((s) => s.trim()).filter(Boolean)),
      ],
    }))
    .filter((g) => g.masterName.length > 0 && g.listingSkus.length > 0);

  if (!normalized.length)
    return { ok: false, message: "Nothing to save." };

  const masterIdByName = new Map<string, string>();

  for (const g of normalized) {
    if (masterIdByName.has(g.masterName)) continue;
    const ins = await insertMasterSku(g.masterName);
    if (!ins.ok || !ins.master)
      return {
        ok: false,
        message: ins.message || `Failed to create SKU "${g.masterName}".`,
      };
    masterIdByName.set(g.masterName, ins.master.id);
  }

  const payloads: {
    listing_sku: string;
    master_sku_id: string;
    category: string;
    user_id: string;
  }[] = [];

  const seenListing = new Set<string>();
  for (const g of normalized) {
    const masterId = masterIdByName.get(g.masterName)!;
    for (const ls of g.listingSkus) {
      if (seenListing.has(ls)) continue;
      seenListing.add(ls);
      payloads.push({
        listing_sku: ls,
        master_sku_id: masterId,
        category: "",
        user_id: userId,
      });
    }
  }

  for (let i = 0; i < payloads.length; i += SKU_MAP_UPSERT_CHUNK) {
    const chunk = payloads.slice(i, i + SKU_MAP_UPSERT_CHUNK);
    let { error } = await sb.from("sku_map").upsert(chunk, {
      onConflict: "user_id,listing_sku",
      ignoreDuplicates: false,
    });
    if (error && isMissingUserIdColumnError(error.message)) {
      const legacyChunk = chunk.map((r) => ({
        listing_sku: r.listing_sku,
        master_sku_id: r.master_sku_id,
        category: r.category,
      }));
      const legacy = await sb.from("sku_map").upsert(legacyChunk, {
        onConflict: "listing_sku",
        ignoreDuplicates: false,
      });
      error = legacy.error;
    }
    if (error) return { ok: false, message: error.message };
  }

  return {
    ok: true,
    message: `Saved ${payloads.length.toLocaleString()} listing mapping(s).`,
  };
}

export async function unassignListingsRemote(
  listingSkus: string[]
): Promise<{ ok: boolean; message: string }> {
  if (!listingSkus.length)
    return { ok: false, message: "Nothing to unmap." };

  const auth = await requireSkuMapAuth();
  if (!auth.ok) return { ok: false, message: auth.message };
  const { sb } = auth;

  const { error } = await sb
    .from("sku_map")
    .update({ master_sku_id: null })
    .in("listing_sku", listingSkus);

  if (error) return { ok: false, message: error.message };
  return { ok: true, message: "Mapping cleared." };
}

export async function deleteSkuMapRowsByListingRemote(
  listingSkus: string[]
): Promise<{ ok: boolean; message: string }> {
  if (!listingSkus.length)
    return { ok: false, message: "No SKUs provided." };

  const auth = await requireSkuMapAuth();
  if (!auth.ok) return { ok: false, message: auth.message };
  const { sb } = auth;

  const { error } = await sb
    .from("sku_map")
    .delete()
    .in("listing_sku", listingSkus);

  if (error) return { ok: false, message: error.message };
  return { ok: true, message: "Deleted." };
}
