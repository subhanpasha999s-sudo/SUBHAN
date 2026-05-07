import Link from "next/link";

import { WORKSPACE_MAX_W, WORKSPACE_GUTTERS } from "@/components/layout/workspace-layout";
import { getPublicContactEmail } from "@/lib/brand/tulmin";
import { cn } from "@/lib/utils";

const contact = getPublicContactEmail();

export function AppFooter() {
  return (
    <footer
      className={cn(
        "mx-auto w-full pb-[env(safe-area-inset-bottom)] pt-2",
        WORKSPACE_MAX_W,
        WORKSPACE_GUTTERS
      )}
      aria-label="Site information"
    >
      <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 border-t border-border/60 py-4 text-center text-[11px] text-muted-foreground sm:justify-between sm:text-left sm:text-xs">
        <nav className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 sm:justify-start">
          <Link
            href="/privacy"
            className="font-medium underline-offset-2 hover:text-foreground hover:underline"
          >
            Privacy
          </Link>
          <Link
            href="/terms"
            className="font-medium underline-offset-2 hover:text-foreground hover:underline"
          >
            Terms
          </Link>
          <a
            href={`mailto:${contact}`}
            className="font-medium underline-offset-2 hover:text-foreground hover:underline"
          >
            Contact
          </a>
        </nav>
        <p className="tabular-nums text-muted-foreground/90">© Tulmin</p>
      </div>
      <p className="mx-auto max-w-md pb-4 pt-3 text-center text-[11px] font-medium leading-snug tracking-wide text-muted-foreground/85">
        Subhan S/O Zulfiqar Husain &amp; Tabssum
      </p>
    </footer>
  );
}
