import { Suspense } from "react";
import type { Metadata } from "next";
import { Loader2 } from "lucide-react";

import { LoginView } from "@/components/auth/login-view";
import { getSiteUrl } from "@/lib/seo/site-url";

export const metadata: Metadata = {
  title: "Sign in · Label",
  description: "Sign in to sync Meesho SKU mappings and use Label across devices.",
  alternates: { canonical: `${getSiteUrl()}/login` },
};

function LoginSuspenseFallback() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 px-4">
      <Loader2 className="size-8 animate-spin text-primary" aria-hidden />
      <p className="text-sm text-muted-foreground">Preparing sign-in…</p>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginSuspenseFallback />}>
      <LoginView />
    </Suspense>
  );
}
