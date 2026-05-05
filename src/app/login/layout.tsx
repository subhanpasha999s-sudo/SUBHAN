import type { ReactNode } from "react";

export default function LoginLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-muted/35 font-sans text-foreground dark:bg-background">
      {children}
    </div>
  );
}
