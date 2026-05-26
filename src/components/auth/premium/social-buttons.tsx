"use client";

import * as React from "react";
import { Globe } from "lucide-react";
import { toast as notify } from "sonner";

import { Button } from "@/components/ui/button";
import { rememberAuthReturnPath } from "@/lib/auth/constants";
import { markSignupTourPending } from "@/lib/auth/signup-tour";
import { getSupabaseBrowser } from "@/lib/supabase/browser-client";
import { cn } from "@/lib/utils";

type Provider = "google";

export function SocialAuthButtons({
  redirectTo,
  className,
  signupIntent = false,
}: {
  redirectTo: string;
  className?: string;
  signupIntent?: boolean;
}) {
  const sb = React.useMemo(() => getSupabaseBrowser(), []);
  const [busy, setBusy] = React.useState<Provider | null>(null);

  async function startOAuth(p: Provider) {
    if (!sb) return;
    setBusy(p);
    try {
      if (signupIntent) {
        markSignupTourPending("*");
      }
      if (redirectTo) {
        try {
          const url = new URL(redirectTo);
          rememberAuthReturnPath(`${url.pathname}${url.search}${url.hash}`);
        } catch {
          rememberAuthReturnPath();
        }
      }
      const { data, error } = await sb.auth.signInWithOAuth({
        provider: p,
        options: { redirectTo, skipBrowserRedirect: true },
      });
      if (error) {
        notify.error("Could not start sign-in", {
          description: error.message,
        });
        return;
      }
      if (!data?.url) {
        notify.error("Sign-in link was not generated. Please try again.");
        return;
      }
      window.location.assign(data.url);
    } finally {
      setBusy(null);
    }
  }

  const btn =
    "h-11 justify-start rounded-xl border border-border/70 bg-background/80 px-4 text-[13px] font-semibold shadow-sm ring-1 ring-border/30 transition-[transform,box-shadow,background-color,border-color] duration-200 ease-smooth hover:bg-background hover:shadow-md active:scale-[0.99] dark:bg-background/60 dark:hover:bg-background";

  return (
    <div className={cn("grid gap-2", className)}>
      {(["google"] as const).map((p) => {
        const isBusy = busy === p;
        return (
          <Button
            key={p}
            type="button"
            variant="outline"
            className={btn}
            disabled={!sb || Boolean(busy)}
            onClick={() => void startOAuth(p)}
          >
            <Globe className="mr-3 size-4 opacity-80" aria-hidden />
            <span className="flex-1 text-left">Continue with Google</span>
            {isBusy ? (
              <span className="text-xs text-muted-foreground">Opening…</span>
            ) : null}
          </Button>
        );
      })}
    </div>
  );
}
