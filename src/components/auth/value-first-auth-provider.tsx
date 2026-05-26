"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";

import type { ValueFirstGateIntent } from "@/lib/auth/value-first-gate-types";
import { rememberAuthReturnPath } from "@/lib/auth/constants";
import { useAuth } from "@/lib/supabase/auth-context";

const ValueFirstOtpModal = dynamic(
  () =>
    import("@/components/auth/value-first-otp-modal").then(
      (m) => m.ValueFirstOtpModal
    ),
  { ssr: false }
);

type ContinueFn = () => void | Promise<void>;

type ProtectedIntent = Exclude<ValueFirstGateIntent, "optional-signin">;

type ValueFirstAuthContextShape = {
  /** OTP modal, then resume download or cloud save */
  requestAuthThenContinue: (
    continuation: ContinueFn,
    intent: ProtectedIntent
  ) => void;
  /** Top bar / settings — OTP only */
  openOptionalSignIn: () => void;
};

const ValueFirstAuthContext =
  React.createContext<ValueFirstAuthContextShape | null>(null);

export function ValueFirstAuthProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const { user, authReady } = useAuth();
  const [modalOpen, setModalOpen] = React.useState(false);
  const [intent, setIntent] = React.useState<ValueFirstGateIntent | null>(null);
  const pendingRef = React.useRef<ContinueFn | null>(null);

  React.useEffect(() => {
    rememberAuthReturnPath();
  }, [pathname]);

  const handleModalOpenChange = React.useCallback((open: boolean) => {
    if (!open) pendingRef.current = null;
    setModalOpen(open);
    if (!open) setIntent(null);
  }, []);

  const requestAuthThenContinue = React.useCallback(
    (continuation: ContinueFn, intentArg: ProtectedIntent) => {
      if (!authReady) return;
      if (user) {
        void continuation();
        return;
      }
      rememberAuthReturnPath();
      pendingRef.current = continuation;
      setIntent(intentArg);
      setModalOpen(true);
    },
    [authReady, user]
  );

  const openOptionalSignIn = React.useCallback(() => {
    if (!authReady || user) return;
    rememberAuthReturnPath();
    pendingRef.current = null;
    setIntent("optional-signin");
    setModalOpen(true);
  }, [authReady, user]);

  const onVerifiedContinue = React.useCallback(async () => {
    const fn = pendingRef.current;
    pendingRef.current = null;
    if (typeof fn !== "function") return;
    try {
      await fn();
    } catch {
      /* handlers toast their own failures */
    }
  }, []);

  const value = React.useMemo<ValueFirstAuthContextShape>(
    () => ({
      requestAuthThenContinue,
      openOptionalSignIn,
    }),
    [requestAuthThenContinue, openOptionalSignIn]
  );

  return (
    <ValueFirstAuthContext.Provider value={value}>
      {children}
      <ValueFirstOtpModal
        open={modalOpen}
        onOpenChange={handleModalOpenChange}
        intent={intent}
        onVerifiedContinue={onVerifiedContinue}
      />
    </ValueFirstAuthContext.Provider>
  );
}

export function useValueFirstAuth(): ValueFirstAuthContextShape {
  const c = React.useContext(ValueFirstAuthContext);
  if (!c)
    throw new Error("useValueFirstAuth must run inside ValueFirstAuthProvider.");
  return c;
}
