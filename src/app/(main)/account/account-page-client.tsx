"use client";

import * as React from "react";

import { Loader2, LogOut } from "lucide-react";

import {
  WorkspaceFormPageStack,
  WorkspaceSurfaceCard,
} from "@/components/layout/workspace-layout";
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
import { getSupabaseBrowser } from "@/lib/supabase/browser-client";
import { toast as notify } from "sonner";

export function AccountPageClient() {
  const [, rerun] = React.useReducer((x) => x + 1, 0);
  const { user, authReady } = useAuth();
  const { openOptionalSignIn } = useValueFirstAuth();
  const [signOutBusy, setSignOutBusy] = React.useState(false);
  const [profileBusy, setProfileBusy] = React.useState(false);
  const [emailBusy, setEmailBusy] = React.useState(false);
  const [passwordBusy, setPasswordBusy] = React.useState(false);
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

  return (
    <>
      <ModulePageHeader
        breadcrumb={[
          { label: "Labels", href: "/export-labels" },
          { label: "Account" },
        ]}
        title="Account"
        description="Profile and sign-in for Tulmin — appearance and device data stay under Settings."
        badges={<Badge variant="outline" className="border-border/65 bg-muted/35 px-2.5 py-0.5 text-xs font-normal text-muted-foreground">Tulmin identity</Badge>}
      />

      <WorkspaceFormPageStack>
        <WorkspaceSurfaceCard
          padding="p-4 sm:p-8"
          className="border-border/20 bg-card/70 shadow-none ring-0 sm:border-border/30 sm:bg-card/90 sm:shadow-elevate-sm sm:ring-1 sm:ring-black/[0.03]"
        >
          <Card className="border-0 shadow-none ring-0">
            <CardHeader className="space-y-2.5 border-b border-border/60 pb-4 sm:space-y-3 sm:border-border/90 sm:pb-5">
              <CardTitle className="text-lg font-semibold tracking-tight text-card-foreground">
                Profile
              </CardTitle>
              <CardDescription className="text-[14px] leading-relaxed text-muted-foreground">
                Name and company shown in your Tulmin workspace.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5 pt-6 pb-6 sm:space-y-6 sm:pt-8 sm:pb-8">
              {!authReady ? (
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                  Loading profile…
                </p>
              ) : !user ? (
                <div className="space-y-3 rounded-lg border border-border/65 bg-muted/12 p-4 sm:bg-muted/25">
                  <p className="text-sm text-foreground">Sign in to edit profile.</p>
                  <Button type="button" size="sm" onClick={openOptionalSignIn} className="font-semibold">
                    Sign in
                  </Button>
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-3 rounded-lg border border-border/65 bg-muted/12 px-4 py-3 sm:rounded-xl sm:bg-muted/20">
                    <div className="flex size-10 items-center justify-center rounded-full bg-primary/12 text-sm font-semibold text-primary">
                      {(profile.fullName || user.email || "U").slice(0, 1).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-foreground">
                        {profile.fullName.trim() || "Signed-in user"}
                      </p>
                      <p className="truncate text-[12px] text-muted-foreground">
                        {user.email ?? "No email"}
                      </p>
                    </div>
                  </div>

                  <div className="grid gap-3.5 sm:gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="account-profile-full-name">Full name</Label>
                      <Input
                        id="account-profile-full-name"
                        value={profile.fullName}
                        onChange={(e) =>
                          setProfile((p) => ({ ...p, fullName: e.target.value }))
                        }
                        placeholder="Your full name"
                        className="min-h-11"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="account-profile-company">Company</Label>
                      <Input
                        id="account-profile-company"
                        value={profile.company}
                        onChange={(e) =>
                          setProfile((p) => ({ ...p, company: e.target.value }))
                        }
                        placeholder="Your company name"
                        className="min-h-11"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="account-profile-email">Email</Label>
                      <Input
                        id="account-profile-email"
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
                      className="min-w-32 w-full font-semibold sm:w-auto"
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
          <WorkspaceSurfaceCard
            padding="p-4 sm:p-8"
            className="border-border/20 bg-card/70 shadow-none ring-0 sm:border-border/30 sm:bg-card/90 sm:shadow-elevate-sm sm:ring-1 sm:ring-black/[0.03]"
          >
            <Card className="border-0 shadow-none ring-0">
              <CardHeader className="space-y-2.5 border-b border-border/60 pb-4 sm:space-y-3 sm:border-border/90 sm:pb-5">
                <CardTitle className="text-lg font-semibold tracking-tight text-card-foreground">
                  Sign-in &amp; security
                </CardTitle>
                <CardDescription className="text-[14px] leading-relaxed text-muted-foreground">
                  Email and password for your Tulmin account.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-7 pt-6 pb-6 sm:space-y-8 sm:pt-8 sm:pb-8">
                <section className="space-y-3">
                  <p className="text-sm font-semibold text-foreground">Change email</p>
                  <div className="grid gap-2">
                    <Label htmlFor="account-change-email">New email</Label>
                    <Input
                      id="account-change-email"
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
                    className="w-full sm:w-auto"
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
                      <Label htmlFor="account-new-password">New password</Label>
                      <Input
                        id="account-new-password"
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
                      <Label htmlFor="account-confirm-password">Confirm password</Label>
                      <Input
                        id="account-confirm-password"
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
                    className="w-full sm:w-auto"
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
        ) : null}

        <WorkspaceSurfaceCard
          padding="p-4 sm:p-8"
          className="border-border/20 bg-card/70 shadow-none ring-0 sm:border-border/30 sm:bg-card/90 sm:shadow-elevate-sm sm:ring-1 sm:ring-black/[0.03]"
        >
          <Card className="border-0 shadow-none ring-0">
            <CardHeader className="space-y-2.5 border-b border-border/60 pb-4 sm:space-y-3 sm:border-border/90 sm:pb-5">
              <CardTitle className="text-lg font-semibold tracking-tight text-card-foreground">
                Session
              </CardTitle>
              <CardDescription className="text-[14px] leading-relaxed text-muted-foreground">
                Sign out on this device when you&apos;re done.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 pt-6 sm:pt-8">
              {!authReady ? (
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                  Checking session…
                </p>
              ) : user ? (
                <div className="space-y-3 rounded-lg border border-border/65 bg-muted/12 p-4 sm:bg-muted/25">
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
                    className="w-full sm:w-auto"
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
                <div className="space-y-3 rounded-lg border border-border/65 bg-muted/12 p-4 sm:bg-muted/25">
                  <p className="text-sm text-foreground">Not signed in.</p>
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
      </WorkspaceFormPageStack>
    </>
  );
}
