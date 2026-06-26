"use client";
/**
 * Tulmin Book section layout. Value-first (no login wall) — consistent with the
 * rest of Tulmin: anyone can use Book; data lives in the localStorage cache and
 * auto-syncs to the signed-in user's cloud row (book_state) when a Tulmin
 * session exists. Sign-in is prompted at save-time, not enforced here.
 */
import { V2Provider } from "@/book/lib/v2/store";
import Shell from "@/book/components/v2/Shell";

export default function BookLayout({ children }: { children: React.ReactNode }) {
  return (
    <V2Provider>
      <Shell>{children}</Shell>
    </V2Provider>
  );
}
