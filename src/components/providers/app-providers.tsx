"use client";

import * as React from "react";

import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "sonner";

import { ThemeProvider } from "@/components/providers/theme-provider";
import { ValueFirstAuthProvider } from "@/components/auth/value-first-auth-provider";
import { AuthProvider } from "@/lib/supabase/auth-context";
import { AnalyticsTracker } from "@/components/providers/analytics-tracker";

/** Tooltips rarely matter on cold load; hydrate after idle to shrink first-paint blocking work. */
function DeferredTooltipProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    if (typeof window === "undefined") return undefined;
    if (typeof window.requestIdleCallback !== "undefined") {
      const id = window.requestIdleCallback(
        () => setMounted(true),
        { timeout: 3200 },
      );
      return () => window.cancelIdleCallback(id);
    }
    const t = window.setTimeout(() => setMounted(true), 450);
    return () => window.clearTimeout(t);
  }, []);

  if (!mounted) {
    return children;
  }
  return (
    <TooltipProvider delay={260}>{children}</TooltipProvider>
  );
}

export function AppProviders({ children }: { children: React.ReactNode }) {
  // Sonner (max-width 600px) stretches toasts full width; mobileOffset.left clears the bottom-left export FAB.
  return (
    <ThemeProvider>
      <AuthProvider>
        <ValueFirstAuthProvider>
          <AnalyticsTracker />
          <DeferredTooltipProvider>
            {children}
            <Toaster
              richColors
              closeButton
              position="bottom-right"
              className="pb-safe"
              offset={{
                bottom: "calc(max(14px, env(safe-area-inset-bottom, 0px)) + 2px)",
                right: "max(14px, env(safe-area-inset-right, 0px))",
              }}
              mobileOffset={{
                left: "5rem",
                bottom: "calc(max(14px, env(safe-area-inset-bottom, 0px)) + 2px)",
                right: "max(14px, env(safe-area-inset-right, 0px))",
              }}
              toastOptions={{
                duration: 4_800,
                classNames: {
                  toast:
                    "rounded-2xl border border-border bg-popover px-4 py-3 font-sans text-[13px] text-popover-foreground shadow-xl backdrop-blur-sm max-w-[min(24rem,calc(100vw-5rem))]",
                },
              }}
            />
          </DeferredTooltipProvider>
        </ValueFirstAuthProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
