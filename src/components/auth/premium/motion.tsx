"use client";

import * as React from "react";
import { motion, type MotionProps } from "framer-motion";

import { cn } from "@/lib/utils";

export function FadeIn({
  children,
  className,
  delay = 0,
  ...props
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
} & MotionProps) {
  return (
    <motion.div
      className={cn(className)}
      initial={{ opacity: 0, y: 10, filter: "blur(4px)" }}
      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      transition={{ duration: 0.38, ease: [0.16, 1, 0.3, 1], delay }}
      {...props}
    >
      {children}
    </motion.div>
  );
}

