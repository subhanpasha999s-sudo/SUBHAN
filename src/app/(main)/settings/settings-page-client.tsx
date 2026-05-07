"use client";

import * as React from "react";

import { Loader2 } from "lucide-react";

import {
  WorkspaceFormPageStack,
  WorkspaceSurfaceCard,
} from "@/components/layout/workspace-layout";
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
import { TULMIN_CONTACT_EMAIL } from "@/lib/brand/tulmin";
import { toast as notify } from "sonner";
import { LAST_AUTH_METHOD_KEY, SIGNIN_NUDGE_DISMISS_KEY } from "@/lib/auth/constants";
import { THEME_STORAGE_KEY } from "@/lib/theme/constants";
import Link from "next/link";

function isMissingUserIdColumnError(message: string | undefined): boolean {
  if (!message) return false;
  return (
    message.includes("Could not find the 'user_id' column") ||
    message.includes('column "user_id" does not exist')
  );
}

export function SettingsPageClient() {
  const { user, authReady } = useAuth();
  const [dangerBusy, setDangerBusy] = React.useState(false);

  function clearThisDeviceData() {
    try {
      localStorage.removeItem(THEME_STORAGE_KEY);
      localStorage.removeItem(LAST_AUTH_METHOD_KEY);
      localStorage.removeItem(SIGNIN_NUDGE_DISMISS_KEY);
      localStorage.removeItem("lable.sku-mapping.local-draft.v1");
      const toDelete: string[] = [];
      for (let i = 0; i < localStorage.length; i += 1) {
        const k = localStorage.key(i);
        if (!k) continue;
        if (
          k.startsWith("lable.sku-map-cache.v1:") ||
          k.startsWith("lable:sku-workspace-v1:") ||
          k.startsWith("lable:sku-mapping:upload-user:")
        ) {
          toDelete.push(k);
        }
      }
      for (const k of toDelete) localStorage.removeItem(k);
      sessionStorage.removeItem("lable:sku-mapping:upload-v1");
      const sk: string[] = [];
      for (let i = 0; i < sessionStorage.length; i += 1) {
        const k = sessionStorage.key(i);
        if (!k) continue;
        if (k.startsWith("lable.meeshoSkuExported.v1:")) sk.push(k);
      }
      for (const k of sk) sessionStorage.removeItem(k);
      notify.success("This device data cleared");
    } catch {
      notify.error("Could not clear local data. Please try again.");
    }
  }

  async function deleteCloudData() {
    const sb = getSupabaseBrowser();
    if (!sb || !user) return;
    setDangerBusy(true);
    try {
      let [
        { error: mapErr },
        { error: masterErr },
        { error: workspaceErr },
      ] = await Promise.all([
        sb.from("sku_map").delete().eq("user_id", user.id),
        sb.from("master_skus").delete().eq("user_id", user.id),
        sb.from("sku_mapping_workspace").delete().eq("user_id", user.id),
      ]);
      const m = workspaceErr?.message ?? "";
      const workspaceIgnorable =
        !workspaceErr ||
        workspaceErr.code === "PGRST205" ||
        m.includes('relation "sku_mapping_workspace"') ||
        (m.includes("sku_mapping_workspace") && m.includes("does not exist")) ||
        m.includes("Could not find the table");
      if (
        isMissingUserIdColumnError(mapErr?.message) ||
        isMissingUserIdColumnError(masterErr?.message)
      ) {
        const legacy = await Promise.all([
          sb.from("sku_map").delete().neq("id", ""),
          sb.from("master_skus").delete().neq("id", ""),
        ]);
        mapErr = legacy[0].error;
        masterErr = legacy[1].error;
      }
      const wsBlocking =
        workspaceErr && !workspaceIgnorable ? workspaceErr : undefined;
      if (mapErr || masterErr || wsBlocking) {
        notify.error(
          mapErr?.message ??
            masterErr?.message ??
            wsBlocking?.message ??
            "Could not delete cloud data."
        );
        return;
      }
      notify.success("Cloud mapping data deleted");
    } finally {
      setDangerBusy(false);
    }
  }

  async function signOut() {
    const sb = getSupabaseBrowser();
    if (!sb) return;
    const { error } = await sb.auth.signOut();
    if (error) notify.error(error.message);
    else notify.success("Signed out.");
  }

  async function requestAccountDeletion() {
    const sb = getSupabaseBrowser();
    if (!sb || !user) return;
    const ok = window.confirm(
      "This will delete your cloud mapping data and sign you out from this device. Continue?"
    );
    if (!ok) return;
    setDangerBusy(true);
    try {
      const del = await Promise.all([
        sb.from("sku_map").delete().eq("user_id", user.id),
        sb.from("master_skus").delete().eq("user_id", user.id),
        sb.from("sku_mapping_workspace").delete().eq("user_id", user.id),
        sb.auth.updateUser({
          data: {
            deletion_requested_at: new Date().toISOString(),
            account_status: "deletion_requested",
          },
        }),
      ]);
      if (
        isMissingUserIdColumnError(del[0].error?.message) ||
        isMissingUserIdColumnError(del[1].error?.message)
      ) {
        await Promise.all([
          sb.from("sku_map").delete().neq("id", ""),
          sb.from("master_skus").delete().neq("id", ""),
        ]);
      }
      const wsErrDel = del[2].error;
      const wsm = wsErrDel?.message ?? "";
      const wsIgnorable =
        !wsErrDel ||
        wsErrDel.code === "PGRST205" ||
        wsm.includes('relation "sku_mapping_workspace"') ||
        (wsm.includes("sku_mapping_workspace") &&
          wsm.includes("does not exist"));
      if (wsErrDel && !wsIgnorable) {
        notify.error(wsErrDel.message);
        return;
      }
      clearThisDeviceData();
      await signOut();
      notify.success("Account deletion requested", {
        description: `Your data is removed from Tulmin workspace tables. For full identity deletion, email ${TULMIN_CONTACT_EMAIL}.`,
      });
    } finally {
      setDangerBusy(false);
    }
  }

  return (
    <>
      <ModulePageHeader
        breadcrumb={[
          { label: "Labels", href: "/export-labels" },
          { label: "Settings" },
        ]}
        title="Settings"
        description="Theme and data on this device and in the cloud. Profile and password live under Account."
        badges={
          <Badge
            variant="outline"
            className="border-border bg-muted/50 px-2.5 py-0.5 text-xs font-normal text-muted-foreground"
          >
            Tulmin workspace
          </Badge>
        }
      />

      <WorkspaceFormPageStack>
        <WorkspaceSurfaceCard padding="p-6 sm:p-8">
          <Card className="border-0 shadow-none ring-0">
            <CardHeader className="space-y-3 border-b border-border/90 pb-5">
              <CardTitle className="text-lg font-semibold tracking-tight text-card-foreground">
                Appearance
              </CardTitle>
              <CardDescription className="text-[14px] leading-relaxed text-muted-foreground">
                Theme is saved on this device only.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-8 pb-8">
              <ThemePreferenceControl />
            </CardContent>
          </Card>
        </WorkspaceSurfaceCard>

        <WorkspaceSurfaceCard padding="p-6 sm:p-8">
          <Card className="border-0 shadow-none ring-0">
            <CardHeader className="space-y-3 border-b border-border/90 pb-5">
              <CardTitle className="text-lg font-semibold tracking-tight text-card-foreground">
                Data control
              </CardTitle>
              <CardDescription className="text-[14px] leading-relaxed text-muted-foreground">
                Clear caches here; cloud wipes need a signed-in account.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 pt-8 pb-8">
              <div className="rounded-lg border border-border bg-muted/20 p-4">
                <p className="text-sm font-semibold text-foreground">This device</p>
                <p className="mt-1 text-[13px] text-muted-foreground">
                  Drops local drafts, label export markers, and cached uploads from this browser.
                </p>
                <Button type="button" variant="outline" className="mt-3" onClick={clearThisDeviceData}>
                  Clear local data
                </Button>
              </div>

              {!authReady ? (
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                  Checking account…
                </p>
              ) : user ? (
                <>
                  <div className="rounded-lg border border-border bg-muted/20 p-4">
                    <p className="text-sm font-semibold text-foreground">Cloud SKU data</p>
                    <p className="mt-1 text-[13px] text-muted-foreground">
                      Deletes your SKU map and master rows in Tulmin&apos;s database for this account.
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      className="mt-3"
                      disabled={dangerBusy}
                      onClick={() => void deleteCloudData()}
                    >
                      {dangerBusy ? "Deleting…" : "Delete cloud data"}
                    </Button>
                  </div>

                  <div className="rounded-lg border border-red-300/60 bg-red-50/70 p-4 dark:border-red-900/70 dark:bg-red-950/30">
                    <p className="text-sm font-semibold text-red-900 dark:text-red-100">
                      Delete account
                    </p>
                    <p className="mt-1 text-[13px] text-red-800/90 dark:text-red-200/90">
                      Signs you out and removes mapping data. For full identity removal, email{" "}
                      {TULMIN_CONTACT_EMAIL}.
                    </p>
                    <Button
                      type="button"
                      variant="destructive"
                      className="mt-3"
                      disabled={dangerBusy}
                      onClick={() => void requestAccountDeletion()}
                    >
                      {dangerBusy ? "Processing…" : "Delete account"}
                    </Button>
                  </div>
                </>
              ) : (
                <p className="text-[13px] text-muted-foreground">
                  Sign in to manage cloud data.{" "}
                  <Link
                    href="/account"
                    className="font-medium text-primary underline-offset-2 hover:underline"
                  >
                    Account
                  </Link>
                </p>
              )}
            </CardContent>
          </Card>
        </WorkspaceSurfaceCard>
      </WorkspaceFormPageStack>
    </>
  );
}
