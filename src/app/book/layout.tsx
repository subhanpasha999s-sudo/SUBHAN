"use client";
import { V2Provider } from "@/book/lib/v2/store";
import Shell from "@/book/components/v2/Shell";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <V2Provider>
      <Shell>{children}</Shell>
    </V2Provider>
  );
}
