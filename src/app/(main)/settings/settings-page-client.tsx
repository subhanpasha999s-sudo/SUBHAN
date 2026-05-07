"use client";

import * as React from "react";

import { CloudOff, Cloud, Loader2, LogOut } from "lucide-react";

import { WorkspaceSurfaceCard } from "@/components/layout/workspace-layout";
import { ThemePreferenceControl } from "@/components/layout/theme-switcher";
import { ModulePageHeader } from "@/components/layout/module-page-header";
import { useValueFirstAuth } from "@/components/auth/value-first-auth-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
} from "@/lib/supabase/browser-client";
import { TULMIN_CONTACT_EMAIL } from "@/lib/brand/tulmin";
import { cn } from "@/lib/utils";
import { toast as notify } from "sonner";
import { LAST_AUTH_METHOD_KEY, SIGNIN_NUDGE_DISMISS_KEY } from "@/lib/auth/constants";
import { THEME_STORAGE_KEY } from "@/lib/theme/constants";

function isMissingUserIdColumnError(message: string | undefined): boolean {
  if (!message) return false;
  return (
    message.includes("Could not find the 'user_id' column") ||
    message.includes('column "user_id" does not exist')
  );
}

export function SettingsPageClient() {
  const [, rerun] = React.useReducer((x) => x + 1, 0);
  const { user, authReady } = useAuth();
  const { openOptionalSignIn } = useValueFirstAuth();
  const connected = !!getSupabaseBrowser();
  const [signOutBusy, setSignOutBusy] = React.useState(false);
  const [profileBusy, setProfileBusy] = React.useState(false);
  const [emailBusy, setEmailBusy] = React.useState(false);
  const [passwordBusy, setPasswordBusy] = React.useState(false);
  const [dangerBusy, setDangerBusy] = React.useState(false);
  const [profile, setProfile] = React.useState({
    fullName: "",
    company: "",
  });
  const [newEmail, setNewEmail] = React.useState("");
  const [passwordForm, setPasswordForm] = React.useState({
    next: "",
    confirm: "",
  });

  React.useEffect(() => {
    const md = user?.user_metadata ?? {};
    setProfile({
      fullName: typeof md.full_name === "string" ? md.full_name : "",
      company: typeof md.company === "string" ? md.company : "",
    });
  }, [user]);

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

  async function saveProfile() {
    const sb = getSupabaseBrowser();
    if (!sb || !user) return;
    setProfileBusy(true);
    try {
      const { error } = await sb.auth.updateUser({
        data: {
          full_name: profile.fullName.trim(),
          company: profile.company.trim(),
        },
      });
      if (error) {
        notify.error(error.message);
        return;
      }
      notify.success("Profile updated");
      rerun();
    } finally {
      setProfileBusy(false);
    }
  }

  async function changeEmail() {
    const sb = getSupabaseBrowser();
    const next = newEmail.trim();
    if (!sb || !user || !next) return;
    setEmailBusy(true);
    try {
      const { error } = await sb.auth.updateUser({ email: next });
      if (error) {
        notify.error(error.message);
        return;
      }
      notify.success("Confirmation email sent", {
        description: "Open your inbox and approve the email change.",
      });
      setNewEmail("");
    } finally {
      setEmailBusy(false);
    }
  }

  async function changePassword() {
    const sb = getSupabaseBrowser();
    if (!sb || !user) return;
    const next = passwordForm.next.trim();
    const confirm = passwordForm.confirm.trim();
    if (next.length < 8) {
      notify.error("Password must be at least 8 characters.");
      return;
    }
    if (next !== confirm) {
      notify.error("Passwords do not match.");
      return;
    }
    setPasswordBusy(true);
    try {
      const { error } = await sb.auth.updateUser({ password: next });
      if (error) {
        notify.error(error.message);
        return;
      }
      notify.success("Password updated");
      setPasswordForm({ next: "", confirm: "" });
    } finally {
      setPasswordBusy(false);
    }
  }

  function clearThisDeviceData() {
    try {
      localStorage.removeItem(THEME_STORAGE_KEY);
      localStorage.removeItem(LAST_AUTH_METHOD_KEY);
      localStorage.removeItem(SIGNIN_NUDGE_DISMISS_KEY);
      // Storage used by mapping + export features.
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
        (m.includes("sku_mapping_workspace") &&
          m.includes("does not exist")) ||
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
        description="Account, sync, and preferences for Tulmin."
        badges={
          <Badge
            variant="outline"
            className="border-border bg-muted/50 px-2.5 py-0.5 text-xs font-normal text-muted-foreground"
          >
            Tulmin account
          </Badge>
        }
      />

      <WorkspaceSurfaceCard padding="p-6 sm:p-8" className="w-full max-w-xl">
        <Card className="border-0 shadow-none ring-0">
          <CardHeader className="space-y-3 border-b border-border/90 pb-5">
            <CardTitle className="text-lg font-semibold tracking-tight text-card-foreground">
              My profile
            </CardTitle>
            <CardDescription className="text-[14px] leading-relaxed text-muted-foreground">
              Manage your account details for a clean, professional workspace identity.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6 pt-8 pb-8">
            {!authReady ? (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" aria-hidden />
                Loading profile…
              </p>
            ) : !user ? (
              <div className="space-y-3 rounded-lg border border-border bg-muted/35 p-4">
                <p className="text-sm text-foreground">
                  Sign in to view and edit your profile details.
                </p>
                <Button type="button" size="sm" onClick={openOptionalSignIn} className="font-semibold">
                  Sign in
                </Button>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-3 rounded-xl border border-border bg-muted/20 px-4 py-3">
                  <div className="flex size-10 items-center justify-center rounded-full bg-primary/12 text-sm font-semibold text-primary">
                    {(profile.fullName || user.email || "U").slice(0, 1).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-foreground">
                      {profile.fullName.trim() || "Workspace user"}
                    </p>
                    <p className="truncate text-[12px] text-muted-foreground">
                      {user.email ?? "No email"}
                    </p>
                  </div>
                </div>

                <div className="grid gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="profile-full-name">Full name</Label>
                    <Input
                      id="profile-full-name"
                      value={profile.fullName}
                      onChange={(e) =>
                        setProfile((p) => ({ ...p, fullName: e.target.value }))
                      }
                      placeholder="Your full name"
                      className="min-h-11"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="profile-company">Company</Label>
                    <Input
                      id="profile-company"
                      value={profile.company}
                      onChange={(e) =>
                        setProfile((p) => ({ ...p, company: e.target.value }))
                      }
                      placeholder="Your company name"
                      className="min-h-11"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="profile-email">Email</Label>
                    <Input
                      id="profile-email"
                      value={user.email ?? ""}
                      readOnly
                      disabled
                      className="min-h-11"
                    />
                  </div>
                </div>

                <div className="flex justify-end">
                  <Button
                    type="button"
                    className="min-w-32 font-semibold"
                    disabled={profileBusy}
                    onClick={() => void saveProfile()}
                  >
                    {profileBusy ? (
                      <>
                        <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />
                        Saving…
                      </>
                    ) : (
                      "Save changes"
                    )}
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </WorkspaceSurfaceCard>

      {user ? (
        <>
          <WorkspaceSurfaceCard padding="p-6 sm:p-8" className="w-full max-w-xl">
            <Card className="border-0 shadow-none ring-0">
              <CardHeader className="space-y-3 border-b border-border/90 pb-5">
                <CardTitle className="text-lg font-semibold tracking-tight text-card-foreground">
                  Account &amp; security
                </CardTitle>
                <CardDescription className="text-[14px] leading-relaxed text-muted-foreground">
                  Change your sign-in email, update password, and manage account safety controls.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-8 pt-8 pb-8">
                <section className="space-y-3">
                  <p className="text-sm font-semibold text-foreground">Change email</p>
                  <div className="grid gap-2">
                    <Label htmlFor="change-email">New email</Label>
                    <Input
                      id="change-email"
                      type="email"
                      autoComplete="email"
                      value={newEmail}
                      onChange={(e) => setNewEmail(e.target.value)}
                      placeholder="name@company.com"
                      className="min-h-11"
                    />
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={emailBusy || !newEmail.trim()}
                    onClick={() => void changeEmail()}
                  >
                    {emailBusy ? "Sending…" : "Send email change confirmation"}
                  </Button>
                </section>

                <section className="space-y-3 border-t border-border pt-6">
                  <p className="text-sm font-semibold text-foreground">Change password</p>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="new-password">New password</Label>
                      <Input
                        id="new-password"
                        type="password"
                        value={passwordForm.next}
                        onChange={(e) =>
                          setPasswordForm((f) => ({ ...f, next: e.target.value }))
                        }
                        className="min-h-11"
                        minLength={8}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="confirm-password">Confirm password</Label>
                      <Input
                        id="confirm-password"
                        type="password"
                        value={passwordForm.confirm}
                        onChange={(e) =>
                          setPasswordForm((f) => ({ ...f, confirm: e.target.value }))
                        }
                        className="min-h-11"
                        minLength={8}
                      />
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={
                      passwordBusy ||
                      !passwordForm.next.trim() ||
                      !passwordForm.confirm.trim()
                    }
                    onClick={() => void changePassword()}
                  >
                    {passwordBusy ? "Updating…" : "Update password"}
                  </Button>
                </section>
              </CardContent>
            </Card>
          </WorkspaceSurfaceCard>

          <WorkspaceSurfaceCard padding="p-6 sm:p-8" className="w-full max-w-xl">
            <Card className="border-0 shadow-none ring-0">
              <CardHeader className="space-y-3 border-b border-border/90 pb-5">
                <CardTitle className="text-lg font-semibold tracking-tight text-card-foreground">
                  Data controls
                </CardTitle>
                <CardDescription className="text-[14px] leading-relaxed text-muted-foreground">
                  Clear uploaded data, remove cloud mappings, or request account deletion.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 pt-8 pb-8">
                <div className="rounded-lg border border-border bg-muted/20 p-4">
                  <p className="text-sm font-semibold text-foreground">Clear this device data</p>
                  <p className="mt-1 text-[13px] text-muted-foreground">
                    Removes cached uploads, local drafts, and quick-history data from this browser.
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    className="mt-3"
                    onClick={clearThisDeviceData}
                  >
                    Clear local data
                  </Button>
                </div>

                <div className="rounded-lg border border-border bg-muted/20 p-4">
                  <p className="text-sm font-semibold text-foreground">Delete cloud upload data</p>
                  <p className="mt-1 text-[13px] text-muted-foreground">
                    Permanently removes your SKU mapping rows and master SKU groups from cloud storage.
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
                    This signs you out and removes mapping data immediately. Full identity deletion can be
                    finalized by support request.
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
              </CardContent>
            </Card>
          </WorkspaceSurfaceCard>
        </>
      ) : null}

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
              Account session
            </CardTitle>
            <CardDescription className="text-[14px] leading-relaxed text-muted-foreground">
              Manage your signed-in session for this workspace.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 pt-8">
            {!authReady ? (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" aria-hidden />
                Checking session…
              </p>
            ) : user ? (
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
            ) : (
              <div className="space-y-3 rounded-lg border border-border bg-muted/35 p-4">
                <p className="text-sm text-foreground">
                  You&apos;re not signed in yet.
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
            )}
          </CardContent>
        </Card>
      </WorkspaceSurfaceCard>
    </>
  );
}
