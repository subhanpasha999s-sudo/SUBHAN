/** Premium auth background: mesh + glow, decorative only. */

export function AuthMeshBg() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      <div className="absolute -left-[18%] -top-[22%] h-[520px] w-[520px] rounded-full bg-gradient-to-br from-sky-300/35 via-blue-200/10 to-transparent blur-3xl dark:from-sky-500/15 dark:via-indigo-500/10" />
      <div className="absolute -right-[22%] top-[12%] h-[560px] w-[560px] rounded-full bg-gradient-to-br from-indigo-300/25 via-fuchsia-200/10 to-transparent blur-3xl dark:from-indigo-500/14 dark:via-fuchsia-500/8" />
      <div className="absolute left-1/2 top-[58%] h-[520px] w-[520px] -translate-x-1/2 rounded-full bg-gradient-to-br from-emerald-200/20 via-sky-200/10 to-transparent blur-3xl dark:from-emerald-500/10 dark:via-sky-500/8" />
      <div className="absolute inset-0 opacity-[0.06] [background-image:radial-gradient(circle_at_1px_1px,rgba(15,23,42,0.9)_1px,transparent_0)] [background-size:18px_18px] dark:opacity-[0.08]" />
    </div>
  );
}
