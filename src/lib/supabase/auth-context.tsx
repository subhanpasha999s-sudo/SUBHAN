"use client";

import * as React from "react";
import type { User } from "@supabase/supabase-js";

import { getSupabaseBrowser } from "@/lib/supabase/browser-client";
import { trackEvent } from "@/lib/analytics/posthog-client";

interface AuthState {
  user: User | null;
  authReady: boolean;
}

const AuthContext = React.createContext<AuthState>({
  user: null,
  authReady: false,
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = React.useState<User | null>(null);
  const [authReady, setAuthReady] = React.useState(false);

  React.useEffect(() => {
    const sb = getSupabaseBrowser();
    if (!sb) {
      setUser(null);
      setAuthReady(true);
      return;
    }

    let cancelled = false;

    void sb.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      setUser(data.session?.user ?? null);
      setAuthReady(true);
    });

    const {
      data: { subscription },
    } = sb.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN") {
        trackEvent("auth_login_success", { method: "session" });
      } else if (event === "SIGNED_OUT") {
        trackEvent("auth_logout", { method: "session" });
      }
      setUser(session?.user ?? null);
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  const value = React.useMemo(() => ({ user, authReady }), [user, authReady]);

  return (
    <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  return React.useContext(AuthContext);
}
