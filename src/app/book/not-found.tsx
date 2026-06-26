import Link from "next/link";
import { Compass } from "lucide-react";

export default function BookNotFound() {
  return (
    <div className="flex min-h-[68vh] flex-col items-center justify-center gap-5 px-6 text-center">
      <div className="flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        <Compass className="size-7" />
      </div>
      <div className="max-w-sm">
        <h1 className="text-xl font-bold">Page not found</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          That Tulmin Book page doesn&apos;t exist. Let&apos;s get you back on track.
        </p>
      </div>
      <Link
        href="/book/dashboard"
        className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
      >
        Back to dashboard
      </Link>
    </div>
  );
}
