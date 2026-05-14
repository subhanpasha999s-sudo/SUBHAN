"use client";

import * as React from "react";

import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "sonner";

import { ThemeProvider } from "@/components/providers/theme-provider";
import { ValueFirstAuthProvider } from "@/components/auth/value-first-auth-provider";
import { AuthProvider } from "@/lib/supabase/auth-context";
import { AnalyticsTracker } from "@/components/providers/analytics-tracker";
import { AppTourProvider } from "@/components/providers/app-tour";

export function AppProviders({ children }: { children: React.ReactNode }) {
  // Sonner (max-width 600px) stretches toasts full width; mobileOffset.left clears the bottom-left export FAB.
  return (
    <ThemeProvider>
      <AuthProvider>
        <ValueFirstAuthProvider>
          <AnalyticsTracker />
          <TooltipProvider delay={220}>
            <AppTourProvider>
              {children}
            </AppTourProvider>
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
          </TooltipProvider>
        </ValueFirstAuthProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
