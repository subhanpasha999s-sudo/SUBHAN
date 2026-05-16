"use client";

import * as React from "react";

import Link from "next/link";
import {
  CheckCircle2,
  Cloud,
  Database,
  HardDrive,
  Loader2,
  LogOut,
  Palette,
  ShieldAlert,
  Sparkles,
  Trash2,
  UserRound,
} from "lucide-react";

import {
  WorkspaceModulePageStack,
  WorkspaceSurfaceCard,
} from "@/components/layout/workspace-layout";
import { ThemePreferenceControl } from "@/components/layout/theme-switcher";
import { ModulePageHeader } from "@/components/layout/module-page-header";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { useAuth } from "@/lib/supabase/auth-context";
import { getSupabaseBrowser } from "@/lib/supabase/browser-client";
import { TULMIN_CONTACT_EMAIL } from "@/lib/brand/tulmin";
import { toast as notify } from "sonner";
import { LAST_AUTH_METHOD_KEY, SIGNIN_NUDGE_DISMISS_KEY } from "@/lib/auth/constants";
import { THEME_STORAGE_KEY } from "@/lib/theme/constants";
import { cn } from "@/lib/utils";

function isMissingUserIdColumnError(message: string | undefined): boolean {
  if (!message) return false;
  return (
    message.includes("Could not find the 'user_id' column") ||
    message.includes('column "user_id" does not exist')
  );
}

function SettingsPanel({
  icon: Icon,
  title,
  description,
  children,
  className,
}: {
  icon: typeof Palette;
  title: string;
  description: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <WorkspaceSurfaceCard
      padding="p-0"
      className={cn(
        "overflow-hidden border-border/55 bg-card/92 shadow-elevate-sm ring-1 ring-black/[0.03] dark:ring-white/[0.05]",
        className
      )}
    >
      <div className="flex items-start gap-4 border-b border-border/60 px-5 py-5 sm:px-6">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20">
          <Icon className="size-5" strokeWidth={1.8} aria-hidden />
        </span>
        <div className="min-w-0">
          <h2 className="text-base font-semibold tracking-tight text-foreground">
            {title}
          </h2>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            {description}
          </p>
        </div>
      </div>
      <div className="p-5 sm:p-6">{children}</div>
    </WorkspaceSurfaceCard>
  );
}

function StatusTile({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "good" | "warn";
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border p-4 shadow-elevate-xs",
        tone === "good"
          ? "border-emerald-200 bg-emerald-50 text-emerald-950 dark:border-emerald-900/60 dark:bg-emerald-950/25 dark:text-emerald-100"
          : tone === "warn"
            ? "border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/25 dark:text-amber-100"
            : "border-border/55 bg-muted/25 text-foreground"
      )}
    >
      <p className="text-[11px] font-bold uppercase tracking-[0.16em] opacity-70">
        {label}
      </p>
      <p className="mt-2 text-sm font-semibold leading-snug">{value}</p>
    </div>
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
        description="A cleaner command center for appearance, workspace data, cloud sync, and account control."
        badges={
          <Badge
            variant="outline"
            className="border-primary/25 bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary"
          >
            Workspace controls
          </Badge>
        }
      />

      <WorkspaceModulePageStack className="gap-5 sm:gap-6">
        <WorkspaceSurfaceCard
          padding="p-5 sm:p-6"
          className="overflow-hidden border-primary/20 bg-[linear-gradient(135deg,rgb(63_108_255/0.10),rgb(16_185_129/0.08)_48%,var(--card)_100%)] shadow-elevate-sm dark:bg-[linear-gradient(135deg,rgb(95_134_255/0.12),rgb(16_185_129/0.08)_48%,var(--card)_100%)]"
        >
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-2xl">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-primary">
                <Sparkles className="size-4" strokeWidth={1.8} aria-hidden />
                Workspace health
              </div>
              <h2 className="mt-3 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
                Keep Tulmin tuned for fast dispatch work.
              </h2>
              <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
                Settings are grouped by daily workflow impact: visual comfort,
                browser storage, cloud sync, and account control.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-3 lg:min-w-[460px]">
              <StatusTile label="Theme" value="Saved on device" tone="good" />
              <StatusTile
                label="Cloud"
                value={authReady && user ? "Connected" : authReady ? "Not signed in" : "Checking"}
                tone={authReady && user ? "good" : "warn"}
              />
              <StatusTile label="Data" value="Local first" />
            </div>
          </div>
        </WorkspaceSurfaceCard>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,0.92fr)_minmax(360px,0.58fr)]">
          <SettingsPanel
            icon={Palette}
            title="Appearance"
            description="Choose the interface mode that fits your workspace lighting. This preference stays on this device."
          >
            <div className="rounded-2xl border border-border/55 bg-muted/25 p-4 sm:p-5">
              <ThemePreferenceControl />
              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                {[
                  ["Light", "Crisp canvas for daytime operations."],
                  ["Dark", "Lower glare for evening packing runs."],
                  ["System", "Matches your device automatically."],
                ].map(([title, copy]) => (
                  <div
                    key={title}
                    className="rounded-xl border border-border/55 bg-card/70 p-3"
                  >
                    <p className="text-sm font-semibold text-foreground">{title}</p>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      {copy}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </SettingsPanel>

          <SettingsPanel
            icon={UserRound}
            title="Account"
            description="Cloud controls appear when an account is connected. Profile details live in Account."
          >
            {!authReady ? (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" aria-hidden />
                Checking account status
              </p>
            ) : user ? (
              <div className="space-y-4">
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-900/60 dark:bg-emerald-950/25">
                  <div className="flex items-center gap-3">
                    <CheckCircle2 className="size-5 text-emerald-700 dark:text-emerald-200" />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-emerald-950 dark:text-emerald-100">
                        Signed in
                      </p>
                      <p className="truncate text-xs text-emerald-800/80 dark:text-emerald-200/80">
                        {user.email}
                      </p>
                    </div>
                  </div>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Link
                    href="/account"
                    className={buttonVariants({
                      variant: "outline",
                      className: "h-10 rounded-xl",
                    })}
                  >
                    Open account
                  </Link>
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-10 rounded-xl text-muted-foreground hover:text-foreground"
                    onClick={() => void signOut()}
                  >
                    <LogOut className="size-4" />
                    Sign out
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/60 dark:bg-amber-950/25">
                  <p className="text-sm font-semibold text-amber-950 dark:text-amber-100">
                    Not signed in
                  </p>
                  <p className="mt-1 text-xs leading-5 text-amber-800/85 dark:text-amber-200/85">
                    You can keep working locally. Sign in when you want mapping
                    data available across browsers.
                  </p>
                </div>
                <Link
                  href="/account"
                  className={buttonVariants({
                    className: "h-10 rounded-xl",
                  })}
                >
                  Go to account
                </Link>
              </div>
            )}
          </SettingsPanel>
        </div>

        <div className="grid gap-5 lg:grid-cols-2">
          <SettingsPanel
            icon={HardDrive}
            title="This Device"
            description="Clear only the local browser workspace. Cloud data is untouched."
          >
            <div className="rounded-2xl border border-border/55 bg-muted/20 p-4">
              <p className="text-sm font-semibold text-foreground">
                Local drafts and caches
              </p>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                Removes local SKU drafts, upload caches, and label export markers
                from this browser.
              </p>
              <Button
                type="button"
                variant="outline"
                className="mt-4 h-10 rounded-xl"
                onClick={clearThisDeviceData}
              >
                <Trash2 className="size-4" />
                Clear local data
              </Button>
            </div>
          </SettingsPanel>

          <SettingsPanel
            icon={Cloud}
            title="Cloud Data"
            description="Manage SKU maps and workspace rows saved to Tulmin for this account."
          >
            {!authReady ? (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" aria-hidden />
                Checking cloud access
              </p>
            ) : user ? (
              <div className="rounded-2xl border border-border/55 bg-muted/20 p-4">
                <div className="flex items-start gap-3">
                  <Database className="mt-0.5 size-5 text-primary" aria-hidden />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground">
                      SKU mapping tables
                    </p>
                    <p className="mt-1 text-sm leading-6 text-muted-foreground">
                      Deletes SKU map, master SKU, and mapping workspace rows
                      for the signed-in account.
                    </p>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  className="mt-4 h-10 rounded-xl"
                  disabled={dangerBusy}
                  onClick={() => void deleteCloudData()}
                >
                  {dangerBusy ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Trash2 className="size-4" />
                  )}
                  {dangerBusy ? "Deleting" : "Delete cloud data"}
                </Button>
              </div>
            ) : (
              <div className="rounded-2xl border border-border/55 bg-muted/20 p-4">
                <p className="text-sm font-semibold text-foreground">
                  Cloud sync is off
                </p>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  Sign in from Account to manage saved cloud data.
                </p>
                <Link
                  href="/account"
                  className={buttonVariants({
                    variant: "outline",
                    className: "mt-4 h-10 rounded-xl",
                  })}
                >
                  Open account
                </Link>
              </div>
            )}
          </SettingsPanel>
        </div>

        <WorkspaceSurfaceCard
          padding="p-0"
          className="overflow-hidden border-red-300/40 bg-red-50/50 shadow-elevate-sm dark:border-red-900/55 dark:bg-red-950/20"
        >
          <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_auto]">
            <div className="flex items-start gap-4 p-5 sm:p-6">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-red-500/10 text-red-700 ring-1 ring-red-500/20 dark:text-red-200">
                <ShieldAlert className="size-5" strokeWidth={1.8} aria-hidden />
              </span>
              <div className="min-w-0">
                <h2 className="text-base font-semibold tracking-tight text-red-950 dark:text-red-100">
                  Danger Zone
                </h2>
                <p className="mt-1 max-w-2xl text-sm leading-6 text-red-800/85 dark:text-red-200/85">
                  Account deletion removes cloud mapping data, signs you out,
                  and marks the account for deletion review. For full identity
                  removal, contact {TULMIN_CONTACT_EMAIL}.
                </p>
              </div>
            </div>
            <div className="flex items-center border-t border-red-300/35 p-5 sm:p-6 lg:border-l lg:border-t-0">
              <Button
                type="button"
                variant="destructive"
                className="h-10 w-full rounded-xl lg:w-auto"
                disabled={!authReady || !user || dangerBusy}
                onClick={() => void requestAccountDeletion()}
              >
                {dangerBusy ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Trash2 className="size-4" />
                )}
                {dangerBusy ? "Processing" : "Delete account"}
              </Button>
            </div>
          </div>
        </WorkspaceSurfaceCard>
      </WorkspaceModulePageStack>
    </>
  );
}
