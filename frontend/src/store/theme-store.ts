import { create } from "zustand";

type Theme = "dark" | "light";

interface ThemeState {
  theme: Theme;
  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;
}

export const useThemeStore = create<ThemeState>((set) => ({
  theme: "dark",
  toggleTheme: () =>
    set((state) => {
      const next = state.theme === "dark" ? "light" : "dark";
      applyTheme(next);
      return { theme: next };
    }),
  setTheme: (theme) => {
    applyTheme(theme);
    set({ theme });
  },
}));

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  const vars: Record<string, [string, string]> = {
    "--color-background":           ["#f3f6fa", "#0d1117"],
    "--color-foreground":           ["#1f2937", "#e6edf3"],
    "--color-card":                 ["#ffffff", "#121a25"],
    "--color-card-foreground":      ["#1f2937", "#e6edf3"],
    "--color-popover":              ["#ffffff", "#131c29"],
    "--color-popover-foreground":   ["#1f2937", "#e6edf3"],
    "--color-primary":              ["#1d67d8", "#2f81f7"],
    "--color-primary-foreground":   ["#ffffff", "#ffffff"],
    "--color-secondary":            ["#eef2f7", "#1b2635"],
    "--color-secondary-foreground": ["#243447", "#d8e0ea"],
    "--color-muted":                ["#edf2f8", "#1a2533"],
    "--color-muted-foreground":     ["#64748b", "#8fa2b8"],
    "--color-accent":               ["#e7edf6", "#1f2d3f"],
    "--color-accent-foreground":    ["#243447", "#dbe6f2"],
    "--color-destructive":          ["#dc2626", "#f85149"],
    "--color-border":               ["#d9e1ec", "#2d3c50"],
    "--color-input":                ["#cfd8e5", "#33455d"],
    "--color-ring":                 ["#1d67d8", "#58a6ff"],
    "--color-sidebar":              ["#ecf2f9", "#0f1623"],
    "--color-sidebar-foreground":   ["#64748b", "#8fa2b8"],
    "--color-sidebar-active":       ["#1d67d8", "#2f81f7"],

    "--surface-0":                  ["#f3f6fa", "#0d1117"],
    "--surface-1":                  ["#ffffff", "#121a25"],
    "--surface-2":                  ["#eef3f9", "#1b2635"],
    "--text-strong":                ["#111827", "#f0f6fc"],
    "--text-normal":                ["#1f2937", "#d8e0ea"],
    "--text-muted":                 ["#64748b", "#8fa2b8"],
    "--line-soft":                  ["#d9e1ec", "#243347"],
    "--line-strong":                ["#c7d2e2", "#33455d"],
    "--state-success":              ["#16a34a", "#3fb950"],
    "--state-warn":                 ["#ca8a04", "#d29922"],
    "--state-error":                ["#dc2626", "#f85149"],
    "--state-info":                 ["#1d67d8", "#58a6ff"],
    "--focus-ring":                 ["#1d67d8", "#58a6ff"],
    "--elevation-1":                ["0 1px 2px rgba(15, 23, 42, 0.08)", "0 1px 2px rgba(0, 0, 0, 0.25)"],
    "--elevation-2":                ["0 10px 30px rgba(15, 23, 42, 0.12)", "0 8px 24px rgba(0, 0, 0, 0.3)"],

    "--color-syntax-property":      ["#2563eb", "#93c5fd"],
    "--color-syntax-string":        ["#16a34a", "#86efac"],
    "--color-syntax-number":        ["#ca8a04", "#fde68a"],
    "--color-syntax-boolean":       ["#1d4ed8", "#79c0ff"],
    "--color-syntax-null":          ["#dc2626", "#fca5a5"],
  };

  const idx = theme === "light" ? 0 : 1;
  for (const [key, values] of Object.entries(vars)) {
    root.style.setProperty(key, values[idx]);
  }
}
