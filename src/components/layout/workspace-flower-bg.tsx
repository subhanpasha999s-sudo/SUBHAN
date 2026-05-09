/** Soft ornamental flowers fixed to the workspace column (not Chrome). Decorative only. */

const PETALS_5 = [0, 72, 144, 216, 288] as const;

export function WorkspaceFlowerBg() {
  return (
    <div
      className="pointer-events-none absolute inset-0 z-0 overflow-hidden select-none"
      aria-hidden
    >
      {/* Large bloom — upper right */}
      <svg
        className="absolute -right-[8%] -top-[12%] h-[min(420px,88vw)] w-[min(420px,88vw)] text-sky-400/35 dark:text-sky-400/14"
        viewBox="0 0 256 256"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <g opacity={0.9}>
          {PETALS_5.map((deg) => (
            <ellipse
              key={deg}
              cx="128"
              cy="70"
              rx="38"
              ry="74"
              fill="currentColor"
              transform={`rotate(${deg} 128 128)`}
            />
          ))}
          <circle cx="128" cy="128" r="46" fill="currentColor" className="opacity-50 dark:opacity-40" />
        </g>
      </svg>

      {/* Mid accent — softened circle ring */}
      <div
        className="pointer-events-none absolute left-1/2 top-[38%] h-[min(320px,80vw)] w-[min(320px,80vw)] -translate-x-1/2 rounded-full bg-gradient-to-br from-sky-200/25 via-transparent to-blue-100/20 blur-3xl dark:from-sky-500/[0.07] dark:via-transparent dark:to-blue-950/30"
      />
    </div>
  );
}
