"use client";
/**
 * Cinematic motion toolkit — shared across the whole app.
 * Reusable, dependency-light building blocks (framer-motion only).
 */
import { useEffect, useRef, useState } from "react";
import {
  animate, AnimatePresence, motion, useMotionValue, useReducedMotion, useTransform,
  type Variants,
} from "framer-motion";

// ── Easings & springs ──────────────────────────────────────────────────

/** Filmic ease — slow in, decisive settle. */
export const EASE_CINEMATIC = [0.16, 1, 0.3, 1] as const;
export const SPRING_SOFT = { type: "spring", stiffness: 260, damping: 26, mass: 0.9 } as const;
export const SPRING_POP  = { type: "spring", stiffness: 480, damping: 22, mass: 0.7 } as const;

// ── Stagger variants ─────────────────────────────────────────────────────

export const stagger: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06, delayChildren: 0.04 } },
};

export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 18, filter: "blur(6px)" },
  show: { opacity: 1, y: 0, filter: "blur(0px)", transition: { duration: 0.55, ease: EASE_CINEMATIC } },
};

export const rowVariant: Variants = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: EASE_CINEMATIC } },
};

// ── Step transition wrapper ──────────────────────────────────────────────

export function StepTransition({
  step, direction = 1, children,
}: { step: string; direction?: number; children: React.ReactNode }) {
  const reduce = useReducedMotion();
  return (
    <AnimatePresence mode="wait" custom={direction}>
      <motion.div
        key={step}
        custom={direction}
        initial={reduce ? { opacity: 0 } : { opacity: 0, x: 60 * direction, scale: 0.98, filter: "blur(8px)" }}
        animate={reduce ? { opacity: 1 } : { opacity: 1, x: 0, scale: 1, filter: "blur(0px)" }}
        exit={reduce ? { opacity: 0 } : { opacity: 0, x: -60 * direction, scale: 0.98, filter: "blur(8px)" }}
        transition={{ duration: 0.5, ease: EASE_CINEMATIC }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}

// ── App-wide page-reveal transition (keyed on route) ─────────────────────

/**
 * Cinematic route-change reveal — every page fades up, de-blurs, and
 * settles with a filmic ease. Snappy enough (~0.4s) not to impede rapid
 * navigation; honours prefers-reduced-motion.
 */
export function PageReveal({ routeKey, children }: { routeKey: string; children: React.ReactNode }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      key={routeKey}
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 14, scale: 0.992, filter: "blur(6px)" }}
      animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
      transition={{ duration: 0.42, ease: EASE_CINEMATIC }}
    >
      {children}
    </motion.div>
  );
}

// ── Count-up animated number ─────────────────────────────────────────────

export function AnimatedNumber({
  value, prefix = "", duration = 1.1, decimals = 2,
}: { value: number; prefix?: string; duration?: number; decimals?: number }) {
  const reduce = useReducedMotion();
  const mv = useMotionValue(0);
  const [display, setDisplay] = useState("0");

  useEffect(() => {
    if (reduce) {
      setDisplay(value.toLocaleString("en-IN", { minimumFractionDigits: decimals, maximumFractionDigits: decimals }));
      return;
    }
    const controls = animate(mv, value, {
      duration, ease: EASE_CINEMATIC,
      onUpdate: v => setDisplay(v.toLocaleString("en-IN", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })),
    });
    return () => controls.stop();
  }, [value, duration, decimals, reduce, mv]);

  return <span className="tabular-nums">{prefix}{display}</span>;
}

// ── Aurora background — drifting blurred orbs ─────────────────────────────

export function Aurora() {
  const reduce = useReducedMotion();
  if (reduce) return null;
  const orbs = [
    { c: "var(--primary)",  x: "-10%", y: "-10%", s: 360, dur: 18 },
    { c: "#22c55e",         x: "70%",  y: "10%",  s: 300, dur: 22 },
    { c: "#3b82f6",         x: "30%",  y: "60%",  s: 320, dur: 26 },
  ];
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden opacity-[0.14] dark:opacity-[0.18]">
      {orbs.map((o, i) => (
        <motion.div
          key={i}
          className="absolute rounded-full"
          style={{
            left: o.x, top: o.y, width: o.s, height: o.s,
            background: `radial-gradient(circle at center, ${o.c}, transparent 70%)`,
            filter: "blur(40px)",
          }}
          animate={{
            x: [0, 60, -40, 0], y: [0, -50, 40, 0], scale: [1, 1.15, 0.95, 1],
          }}
          transition={{ duration: o.dur, repeat: Infinity, ease: "easeInOut" }}
        />
      ))}
    </div>
  );
}

// ── Drawn checkmark (SVG path) ───────────────────────────────────────────

export function DrawCheck({ size = 64 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none">
      <motion.circle
        cx="32" cy="32" r="29" stroke="var(--success)" strokeWidth="3"
        initial={{ pathLength: 0, opacity: 0 }}
        animate={{ pathLength: 1, opacity: 1 }}
        transition={{ duration: 0.7, ease: EASE_CINEMATIC }}
      />
      <motion.path
        d="M20 33 L29 42 L45 24" stroke="var(--success)" strokeWidth="4"
        strokeLinecap="round" strokeLinejoin="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.45, ease: EASE_CINEMATIC, delay: 0.5 }}
      />
    </svg>
  );
}

// ── Confetti burst ───────────────────────────────────────────────────────

const CONFETTI_COLORS = ["#7c3aed", "#22c55e", "#3b82f6", "#f59e0b", "#ec4899", "#06b6d4"];

export function ConfettiBurst({ count = 90 }: { count?: number }) {
  const reduce = useReducedMotion();
  const pieces = useRef(
    Array.from({ length: count }, (_, i) => ({
      id: i,
      x: (Math.random() - 0.5) * 700,
      rot: Math.random() * 720 - 360,
      delay: Math.random() * 0.25,
      dur: 1.6 + Math.random() * 1.2,
      color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      size: 6 + Math.random() * 8,
      drift: (Math.random() - 0.5) * 120,
    }))
  ).current;

  if (reduce) return null;

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-[70] flex justify-center overflow-hidden">
      {pieces.map(p => (
        <motion.span
          key={p.id}
          className="absolute top-[22%]"
          style={{ width: p.size, height: p.size * 1.6, borderRadius: 2, background: p.color }}
          initial={{ x: p.x * 0.3, y: 0, opacity: 1, rotate: 0 }}
          animate={{ x: p.x + p.drift, y: "85vh", opacity: [1, 1, 0], rotate: p.rot }}
          transition={{ duration: p.dur, delay: p.delay, ease: [0.2, 0.6, 0.4, 1] }}
        />
      ))}
    </div>
  );
}

// ── AI scanning sweep overlay ────────────────────────────────────────────

export function ScanSweep({ active }: { active: boolean }) {
  const reduce = useReducedMotion();
  if (!active || reduce) return null;
  return (
    <motion.div
      aria-hidden
      className="pointer-events-none absolute inset-x-0 top-0 h-24"
      style={{
        background: "linear-gradient(180deg, transparent, var(--primary), transparent)",
        opacity: 0.16,
      }}
      initial={{ y: -100 }}
      animate={{ y: ["-10%", "1100%"] }}
      transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
    />
  );
}

// ── Pulsing dot ──────────────────────────────────────────────────────────

export function PulseDot({ color = "var(--primary)" }: { color?: string }) {
  return (
    <span className="relative flex h-2 w-2">
      <motion.span
        className="absolute inline-flex h-full w-full rounded-full"
        style={{ background: color }}
        animate={{ scale: [1, 2.4, 1], opacity: [0.7, 0, 0.7] }}
        transition={{ duration: 1.8, repeat: Infinity, ease: "easeOut" }}
      />
      <span className="relative inline-flex h-2 w-2 rounded-full" style={{ background: color }} />
    </span>
  );
}

export { motion, AnimatePresence, useReducedMotion, useTransform, useMotionValue };
