import type { ReactNode } from "react";

export default function LoginLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen font-sans text-foreground">
      {children}
    </div>
  );
}
