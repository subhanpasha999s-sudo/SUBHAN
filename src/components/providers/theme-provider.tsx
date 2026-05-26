"use client";

import * as React from "react";

import {
  THEME_STORAGE_KEY,
  type ThemePreference,
} from "@/lib/theme/constants";

export type ResolvedTheme = "light" | "dark";

const THEME_COLORS: Record<ResolvedTheme, string> = {
  light: "#f6f8fb",
  dark: "#080f1d",
};

function readStoredPreference(): ThemePreference {
  if (typeof window === "undefined") return "system";
  try {
    const v = localStorage.getItem(THEME_STORAGE_KEY);
    if (v === "light" || v === "dark" || v === "system") return v;
  } catch {
    /* private mode */
  }
  return "system";
}

function systemPrefersDark(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function resolveTheme(pref: ThemePreference): ResolvedTheme {
  if (pref === "dark") return "dark";
  if (pref === "light") return "light";
  return systemPrefersDark() ? "dark" : "light";
}

function applyDom(theme: ResolvedTheme) {
  const root = document.documentElement;
  root.classList.toggle("dark", theme === "dark");
  root.style.colorScheme = theme;

  let meta = document.querySelector<HTMLMetaElement>(
    'meta[name="theme-color"][data-tulmin-theme-color="true"]'
  );
  if (!meta) {
    meta = document.createElement("meta");
    meta.name = "theme-color";
    meta.dataset.tulminThemeColor = "true";
    document.head.appendChild(meta);
  }
  meta.content = THEME_COLORS[theme];
}

type ThemeCtx = {
  preference: ThemePreference;
  resolved: ResolvedTheme;
  setPreference: (p: ThemePreference) => void;
};

const ThemeContext = React.createContext<ThemeCtx | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [preference, setPreferenceState] = React.useState<ThemePreference>(
    () => (typeof window !== "undefined" ? readStoredPreference() : "system")
  );
  const [resolved, setResolved] = React.useState<ResolvedTheme>(() =>
    typeof window !== "undefined"
      ? resolveTheme(readStoredPreference())
      : "light"
  );

  React.useEffect(() => {
    applyDom(resolved);
  }, [resolved]);

  React.useEffect(() => {
    if (preference !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      const next = resolveTheme("system");
      setResolved(next);
      applyDom(next);
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [preference]);

  const setPreference = React.useCallback((p: ThemePreference) => {
    setPreferenceState(p);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, p);
    } catch {
      /* ignore */
    }
    const r = resolveTheme(p);
    setResolved(r);
    applyDom(r);
  }, []);

  const value = React.useMemo(
    () => ({ preference, resolved, setPreference }),
    [preference, resolved, setPreference]
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme(): ThemeCtx {
  const ctx = React.useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return ctx;
}
