"use client";
/** Dependency-free one-shot confetti burst (CSS keyframes). Fires once on mount. */
import { useEffect, useState } from "react";

const COLORS = ["#7c3aed", "#16a34a", "#0ea5e9", "#eab308", "#ef4444", "#14b8a6"];

export default function Confetti({ fire }: { fire: boolean }) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!fire) return;
    // respect reduced-motion
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    setShow(true);
    const t = setTimeout(() => setShow(false), 2400);
    return () => clearTimeout(t);
  }, [fire]);

  if (!show) return null;
  return (
    <>
      {Array.from({ length: 80 }).map((_, i) => (
        <span
          key={i}
          className="confetti-piece"
          style={{
            left: `${Math.random() * 100}%`,
            background: COLORS[i % COLORS.length],
            animationDelay: `${Math.random() * 0.5}s`,
            transform: `scale(${0.6 + Math.random() * 0.8})`,
          }}
        />
      ))}
    </>
  );
}
