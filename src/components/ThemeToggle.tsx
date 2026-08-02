"use client";

import { useTheme } from "@/hooks/useTheme";

export default function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const icons: Record<string, string> = {
    light: "🌑",
    dark: "🖥️",
    system: "☀️",
  };
  const labels: Record<string, string> = {
    light: "Switch to dark mode",
    dark: "Switch to system mode",
    system: "Switch to light mode",
  };
  return (
    <button
      onClick={toggleTheme}
      aria-label={labels[theme]}
      title={labels[theme]}
      className="p-2 rounded-lg text-zinc-500 hover:text-zinc-900 hover:bg-zinc-200 dark:hover:text-white dark:hover:bg-zinc-700 transition-colors"
    >
      {icons[theme]}
    </button>
  );
}
