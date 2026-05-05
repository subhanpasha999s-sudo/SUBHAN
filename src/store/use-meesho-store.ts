"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { safeLocalStorage } from "@/lib/storage/safe-local-storage";

interface AppShellLayoutState {
  sidebarCollapsed: boolean;
  setSidebarCollapsed: (v: boolean) => void;
}

/** Shell UI persistence only (label workspace module removed). */
export const useMeeshoStore = create<AppShellLayoutState>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      setSidebarCollapsed: (sidebarCollapsed) => set({ sidebarCollapsed }),
    }),
    {
      name: "lable-app-shell-v1",
      storage: createJSONStorage(() => safeLocalStorage),
      partialize: (s) => ({ sidebarCollapsed: s.sidebarCollapsed }),
    }
  )
);
