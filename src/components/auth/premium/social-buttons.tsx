"use client";

import * as React from "react";
import { Apple, Chrome, Windows } from "lucide-react";

import { Button } from "@/components/ui/button";
import { getSupabaseBrowser } from "@/lib/supabase/browser-client";
import { cn } from "@/lib/utils";

type Provider = "google" | "azure" | "apple";

function providerMeta(p: Provider) {
  switch (p) {
    case "google":
      return { label: "Continue with Google", Icon: Chrome };
    case "azure":
      return { label: "Continue with Microsoft", Icon: Windows };
    case "apple":
      return { label: "Continue with Apple", Icon: Apple };
  }
}

export function SocialAuthButtons({
  redirectTo,
  className,
}: {
  redirectTo: string;
  className?: string;
}) {
  const sb = React.useMemo(() => getSupabaseBrowser(), []);
  const [busy, setBusy] = React.useState<Provider | null>(null);

  async function startOAuth(p: Provider) {
    if (!sb) return;
    setBusy(p);
    try {
      const provider = p === "azure" ? ("azure" as const) : p;
      const { error } = await sb.auth.signInWithOAuth({
        provider,
        options: { redirectTo },
      });
      if (error) {
        // keep UX quiet; callers can toast if desired
        console.error(error);
      }
    } finally {
      setBusy(null);
    }
  }

  const btn =
    "h-11 justify-start rounded-xl border border-border/70 bg-background/80 px-4 text-[13px] font-semibold shadow-sm ring-1 ring-border/30 transition-[transform,box-shadow,background-color,border-color] duration-200 ease-smooth hover:bg-background hover:shadow-md active:scale-[0.99] dark:bg-background/60 dark:hover:bg-background";

  return (
    <div className={cn("grid gap-2", className)}>
      {(["google", "azure", "apple"] as const).map((p) => {
        const { label, Icon } = providerMeta(p);
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
            <Icon className="mr-3 size-4 opacity-80" aria-hidden />
            <span className="flex-1 text-left">{label}</span>
            {isBusy ? (
              <span className="text-xs text-muted-foreground">Opening…</span>
            ) : null}
          </Button>
        );
      })}
    </div>
  );
}

