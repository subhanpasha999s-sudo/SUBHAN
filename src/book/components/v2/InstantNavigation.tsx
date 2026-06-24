"use client";
import React, { createContext, useContext } from "react";

interface InstantNavigationValue {
  activePath: string;
  navigate(event: React.MouseEvent<HTMLElement>, href: string): void;
  prefetch(href: string): void;
}

const InstantNavigationContext = createContext<InstantNavigationValue | null>(null);

export function InstantNavigationProvider({
  value,
  children,
}: {
  value: InstantNavigationValue;
  children: React.ReactNode;
}) {
  return (
    <InstantNavigationContext.Provider value={value}>
      {children}
    </InstantNavigationContext.Provider>
  );
}

export function useInstantNavigation() {
  return useContext(InstantNavigationContext);
}
