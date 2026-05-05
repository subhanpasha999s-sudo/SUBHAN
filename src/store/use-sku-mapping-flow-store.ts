"use client";

import { create } from "zustand";

import {
  assignListingsToMasterRemote,
  fetchSkuMapSnapshot,
  insertMasterSku,
  unassignListingsRemote,
  type MasterSkuRecord,
  type SkuMapRecord,
} from "@/lib/supabase/sku-map-remote";

export interface LastAssignOp {
  listingSkus: string[];
  masterId: string;
}

interface SkuMappingFlowState {
  masters: MasterSkuRecord[];
  skuRows: SkuMapRecord[];
  loading: boolean;
  lastFetchError: string | null;
  saving: boolean;
  creatingMaster: boolean;
  undoing: boolean;
  activeMasterId: string | null;
  selectedListings: Record<string, true>;
  pickFilter: string;
  expandedMappedIds: Record<string, boolean>;
  lastOp: LastAssignOp | null;

  refresh: () => Promise<boolean>;
  createMasterAndSelect: (
    name: string
  ) => Promise<{ ok: true; message: string } | { ok: false; message: string }>;
  setActiveMaster: (id: string | null) => void;
  toggleListingPick: (listingSku: string) => void;
  selectAllUnmapped: (listingSkus: string[]) => void;
  clearPickSelection: () => void;
  setPickFilter: (q: string) => void;
  toggleMappedExpanded: (masterId: string) => void;
  saveMapping: () => Promise<void>;
  undoLast: () => Promise<void>;
  unmapListing: (listingSku: string) => Promise<void>;
}

function applyLocalAssign(
  rows: SkuMapRecord[],
  listingSkus: string[],
  masterId: string
): SkuMapRecord[] {
  const touch = new Set(listingSkus);
  return rows.map((r) =>
    touch.has(r.listing_sku) ? { ...r, master_sku_id: masterId } : r
  );
}

function applyLocalUnassign(
  rows: SkuMapRecord[],
  listingSkus: string[]
): SkuMapRecord[] {
  const touch = new Set(listingSkus);
  return rows.map((r) =>
    touch.has(r.listing_sku) ? { ...r, master_sku_id: null } : r
  );
}

export const useSkuMappingFlowStore = create<SkuMappingFlowState>((set, get) => ({
  masters: [],
  skuRows: [],
  loading: false,
  lastFetchError: null,
  saving: false,
  creatingMaster: false,
  undoing: false,
  activeMasterId: null,
  selectedListings: {},
  pickFilter: "",
  expandedMappedIds: {},
  lastOp: null,

  async refresh() {
    set({ loading: true, lastFetchError: null });
    const snap = await fetchSkuMapSnapshot();
    if (!snap.ok || !snap.masters || !snap.skuMap) {
      set({
        loading: false,
        lastFetchError: snap.ok ? "Incomplete response" : snap.message,
      });
      return false;
    }
    set({
      masters: snap.masters,
      skuRows: snap.skuMap,
      loading: false,
      lastFetchError: null,
    });
    return true;
  },

  async createMasterAndSelect(name: string) {
    set({ creatingMaster: true });
    const res = await insertMasterSku(name);
    set({ creatingMaster: false });
    if (!res.ok || !res.master) {
      return { ok: false as const, message: res.message };
    }
    set((s) => {
      const exists = s.masters.some((m) => m.id === res.master!.id);
      const masters = exists
        ? s.masters
        : [...s.masters, res.master!].sort((a, b) =>
            a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
          );
      return {
        masters,
        activeMasterId: res.master!.id,
      };
    });
    return { ok: true as const, message: res.message };
  },

  setActiveMaster: (id) => set({ activeMasterId: id }),

  toggleListingPick: (listingSku) =>
    set((s) => {
      const next = { ...s.selectedListings };
      if (next[listingSku]) delete next[listingSku];
      else next[listingSku] = true;
      return { selectedListings: next };
    }),

  selectAllUnmapped: (listingSkus) =>
    set((s) => {
      const next = { ...s.selectedListings };
      for (const sku of listingSkus) next[sku] = true;
      return { selectedListings: next };
    }),

  clearPickSelection: () => set({ selectedListings: {} }),

  setPickFilter: (pickFilter) => set({ pickFilter }),

  toggleMappedExpanded: (masterId) =>
    set((s) => ({
      expandedMappedIds: {
        ...s.expandedMappedIds,
        [masterId]: !s.expandedMappedIds[masterId],
      },
    })),

  async saveMapping() {
    const {
      activeMasterId,
      selectedListings,
      masters,
      skuRows: prevSkuRows,
    } = get();
    const listingSkus = Object.keys(selectedListings);
    if (!activeMasterId || listingSkus.length === 0) return;

    const prevSelected = { ...selectedListings };

    set({ saving: true });

    const optimisticRows = applyLocalAssign(
      prevSkuRows,
      listingSkus,
      activeMasterId
    );
    set({
      skuRows: optimisticRows,
      selectedListings: {},
      lastOp: { listingSkus, masterId: activeMasterId },
    });

    const res = await assignListingsToMasterRemote(
      activeMasterId,
      listingSkus
    );

    if (!res.ok) {
      set({
        skuRows: prevSkuRows,
        saving: false,
        lastOp: null,
        selectedListings: prevSelected,
      });
      throw new Error(res.message);
    }

    set({ saving: false });
  },

  async undoLast() {
    const op = get().lastOp;
    if (!op) return;

    set({ undoing: true });
    const res = await unassignListingsRemote(op.listingSkus);
    if (!res.ok) {
      set({ undoing: false });
      throw new Error(res.message);
    }

    await get().refresh();
    set({ lastOp: null, undoing: false });
  },

  async unmapListing(listingSku) {
    const { skuRows } = get();
    const trimmed = listingSku.trim();
    if (!trimmed) return;

    const optimisticRows = applyLocalUnassign(skuRows, [trimmed]);
    set({ skuRows: optimisticRows });

    const res = await unassignListingsRemote([trimmed]);
    if (!res.ok) {
      await get().refresh();
      throw new Error(res.message);
    }
    await get().refresh();
  },
}));
