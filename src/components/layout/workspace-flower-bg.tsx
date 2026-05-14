/** Soft ornamental flowers fixed to the workspace column (not Chrome). Decorative only. */

const PETALS_5 = [0, 72, 144, 216, 288] as const;

export function WorkspaceFlowerBg() {
  return (
    <div
      className="pointer-events-none absolute inset-0 z-0 hidden overflow-hidden select-none sm:block"
      aria-hidden
    >
      {/* Large bloom — upper right */}
      <svg
        className="absolute -right-[8%] -top-[12%] h-[min(380px,72vw)] w-[min(380px,72vw)] text-sky-400/16 dark:text-sky-400/[0.07]"
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
    </div>
  );
}
