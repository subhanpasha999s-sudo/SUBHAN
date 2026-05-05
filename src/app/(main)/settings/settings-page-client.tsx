"use client";

import * as React from "react";

import { CloudOff, Cloud, Loader2, LogOut } from "lucide-react";

import { WorkspaceSurfaceCard } from "@/components/layout/workspace-layout";
import { ThemePreferenceControl } from "@/components/layout/theme-switcher";
import { ModulePageHeader } from "@/components/layout/module-page-header";
import { useValueFirstAuth } from "@/components/auth/value-first-auth-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useAuth } from "@/lib/supabase/auth-context";
import {
  getSupabaseBrowser,
  resetSupabaseBrowserClient,
} from "@/lib/supabase/browser-client";
import { cn } from "@/lib/utils";
import { toast as notify } from "sonner";

export function SettingsPageClient() {
  const [, rerun] = React.useReducer((x) => x + 1, 0);
  const { user, authReady } = useAuth();
  const { openOptionalSignIn } = useValueFirstAuth();
  const connected = !!getSupabaseBrowser();
  const [signOutBusy, setSignOutBusy] = React.useState(false);

  async function signOut() {
    const sb = getSupabaseBrowser();
    if (!sb) return;
    setSignOutBusy(true);
    try {
      const { error } = await sb.auth.signOut();
      if (error) notify.error(error.message);
      else notify.success("Signed out.");
    } finally {
      setSignOutBusy(false);
    }
  }

  return (
    <>
      <ModulePageHeader
        breadcrumb={[
          { label: "Label PDF", href: "/export-labels" },
          { label: "Settings" },
        ]}
        title="Settings"
        description="Workspace preferences and Supabase credentials. Sign in anytime from the header—or when you save mappings or export."
        badges={
          <Badge
            variant="outline"
            className="border-border bg-muted/50 px-2.5 py-0.5 text-xs font-normal text-muted-foreground"
          >
            Workspace &amp; backend
          </Badge>
        }
      />

      <WorkspaceSurfaceCard padding="p-6 sm:p-8" className="w-full max-w-xl">
        <Card className="border-0 shadow-none ring-0">
          <CardHeader className="space-y-3 border-b border-border/90 pb-5">
            <CardTitle className="text-lg font-semibold tracking-tight text-card-foreground">
              Appearance
            </CardTitle>
            <CardDescription className="text-[14px] leading-relaxed text-muted-foreground">
              Light, dark, or system default—stored on this device only.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-8 pb-8">
            <ThemePreferenceControl />
          </CardContent>
        </Card>
      </WorkspaceSurfaceCard>

      <WorkspaceSurfaceCard padding="p-6 sm:p-8" className="w-full max-w-xl">
        <Card className="border-0 shadow-none ring-0">
          <CardHeader className="space-y-3 border-b border-border/90 pb-5">
            <CardTitle className="text-lg font-semibold tracking-tight text-card-foreground">
              Cloud backend
            </CardTitle>
            <CardDescription className="text-[14px] leading-relaxed text-muted-foreground">
              Uses{" "}
              <code className="rounded-md border border-border bg-muted px-2 py-0.5 font-mono text-xs text-foreground">
                NEXT_PUBLIC_SUPABASE_URL
              </code>{" "}
              and{" "}
              <code className="rounded-md border border-border bg-muted px-2 py-0.5 font-mono text-xs text-foreground">
                NEXT_PUBLIC_SUPABASE_ANON_KEY
              </code>
              . Restart the dev server after edits.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6 pt-8">
            <div
              className={cn(
                "flex items-center gap-3 rounded-lg border px-4 py-3",
                connected
                  ? "border-emerald-200 bg-emerald-50 text-emerald-950 dark:border-emerald-900/70 dark:bg-emerald-950/45 dark:text-emerald-50"
                  : "border-border bg-muted/40 text-muted-foreground"
              )}
            >
              {connected ? (
                <Cloud
                  className="size-6 shrink-0 text-emerald-700 dark:text-emerald-300"
                  aria-hidden
                />
              ) : (
                <CloudOff className="size-6 shrink-0 opacity-80" aria-hidden />
              )}
              <div className="min-w-0">
                <p
                  className={cn(
                    "text-sm font-semibold",
                    connected
                      ? "text-emerald-950 dark:text-emerald-50"
                      : "text-foreground"
                  )}
                >
                  {connected ? "Backend ready" : "Not configured"}
                </p>
                <p
                  className={cn(
                    "mt-0.5 text-[13px]",
                    connected
                      ? "text-emerald-900/85 dark:text-emerald-100/90"
                      : "text-muted-foreground"
                  )}
                >
                  {connected
                    ? "Sign in to persist SKU maps to your workspace."
                    : "Add credentials to `.env.local`, save, reload this page."}
                </p>
              </div>
            </div>

            {!authReady ? (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" aria-hidden />
                Checking session…
              </p>
            ) : connected && user ? (
              <div className="space-y-3 rounded-lg border border-border bg-muted/35 p-4">
                <p className="text-sm font-medium text-foreground">
                  Signed in as{" "}
                  <span className="font-mono text-[13px] text-muted-foreground">
                    {user.email ?? user.id}
                  </span>
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={signOutBusy}
                  onClick={() => void signOut()}
                >
                  {signOutBusy ? (
                    <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />
                  ) : (
                    <LogOut className="mr-2 size-4" aria-hidden />
                  )}
                  Sign out
                </Button>
              </div>
            ) : connected && !user ? (
              <div className="space-y-3 rounded-lg border border-border bg-muted/35 p-4">
                <p className="text-sm text-foreground">
                  You&apos;re not signed in. Everything still works on this device—sign in when
                  you want SKU maps synced to your workspace.
                </p>
                <Button
                  type="button"
                  size="sm"
                  onClick={openOptionalSignIn}
                  className="font-semibold"
                >
                  Sign in
                </Button>
              </div>
            ) : null}

            <div className="border-t border-border pt-5">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full text-primary hover:bg-muted sm:w-auto"
                onClick={() => {
                  resetSupabaseBrowserClient();
                  rerun();
                }}
              >
                Refresh backend status
              </Button>
            </div>
          </CardContent>
        </Card>
      </WorkspaceSurfaceCard>
    </>
  );
}
