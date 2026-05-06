import type { ReactNode } from "react";

import { cn } from "@/lib/utils";
import { AuthMeshBg } from "@/components/auth/premium/auth-mesh-bg";

export function AuthShell({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "relative min-h-screen bg-[#eef1f6] font-sans text-foreground dark:bg-background",
        className
      )}
    >
      <AuthMeshBg />
      <div className="relative mx-auto flex min-h-screen w-full max-w-[1040px] items-center px-4 py-10 sm:py-14">
        {children}
      </div>
    </div>
  );
}

