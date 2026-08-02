"use client";

import { useSyncExternalStore, useCallback } from "react";

export type Theme = "light" | "dark" | "system";

function getInitialTheme(): Theme {
  if (typeof window === "undefined") return "light";
  const stored = localStorage.getItem("theme");
  return stored === "dark" || stored === "system" ? stored : "light";
}

let currentTheme: Theme = getInitialTheme();
const listeners = new Set<() => void>();

function prefersDark(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function applyThemeClass() {
  const dark = currentTheme === "dark" || (currentTheme === "system" && prefersDark());
  document.documentElement.classList.toggle("dark", dark);
}

function emitThemeChange() {
  applyThemeClass();
  listeners.forEach((listener) => listener());
}

let mediaQuery: MediaQueryList | null = null;
function ensureMediaListener() {
  if (typeof window === "undefined" || mediaQuery) return;
  mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
  mediaQuery.addEventListener("change", emitThemeChange);
}

function subscribe(listener: () => void) {
  ensureMediaListener();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): Theme {
  return currentTheme;
}

function getServerSnapshot(): Theme {
  return "light";
}

export function useTheme() {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const toggleTheme = useCallback(() => {
    currentTheme = theme === "light" ? "dark" : theme === "dark" ? "system" : "light";
    localStorage.setItem("theme", currentTheme);
    emitThemeChange();
  }, [theme]);

  return { theme, toggleTheme };
}
