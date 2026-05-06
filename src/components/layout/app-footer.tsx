import Link from "next/link";

import { WORKSPACE_MAX_W } from "@/components/layout/workspace-layout";

const contact = process.env.NEXT_PUBLIC_CONTACT_EMAIL?.trim();

export function AppFooter() {
  return (
    <footer
      className={`mx-auto w-full ${WORKSPACE_MAX_W} px-4 pb-[env(safe-area-inset-bottom)] pt-2 sm:px-6 lg:px-8`}
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
          {contact ? (
            <a
              href={`mailto:${contact}`}
              className="font-medium underline-offset-2 hover:text-foreground hover:underline"
            >
              Contact
            </a>
          ) : null}
        </nav>
        <p className="tabular-nums text-muted-foreground/90">
          Label · PDF &amp; SKU tools
        </p>
      </div>
      <p className="pb-4 pt-3 text-center text-[11px] font-medium tracking-wide text-muted-foreground/85">
        Subhan
      </p>
    </footer>
  );
}
