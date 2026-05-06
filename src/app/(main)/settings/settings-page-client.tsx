"use client";

import * as React from "react";

import { Loader2, LogOut } from "lucide-react";

import { WorkspaceSurfaceCard } from "@/components/layout/workspace-layout";
import { ThemePreferenceControl } from "@/components/layout/theme-switcher";
import { ModulePageHeader } from "@/components/layout/module-page-header";
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
import { getSupabaseBrowser } from "@/lib/supabase/browser-client";
import { toast as notify } from "sonner";

export function SettingsPageClient() {
  const { user } = useAuth();
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
        description="Fine-tune your workspace for speed, consistency, and secure sync across your team."
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
              Keep your workspace comfortable for long operations with theme preferences saved on this device.
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
              Account
            </CardTitle>
            <CardDescription className="text-[14px] leading-relaxed text-muted-foreground">
              Manage your session.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6 pt-8">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={signOutBusy || !user}
              onClick={() => void signOut()}
            >
              {signOutBusy ? (
                <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />
              ) : (
                <LogOut className="mr-2 size-4" aria-hidden />
              )}
              Sign out
            </Button>
          </CardContent>
        </Card>
      </WorkspaceSurfaceCard>
    </>
  );
}
