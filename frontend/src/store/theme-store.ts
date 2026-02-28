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
    "--color-background":           ["#ffffff", "#0f1117"],
    "--color-foreground":           ["#09090b", "#e4e4e7"],
    "--color-card":                 ["#f4f4f5", "#18181b"],
    "--color-card-foreground":      ["#09090b", "#e4e4e7"],
    "--color-popover":              ["#ffffff", "#18181b"],
    "--color-popover-foreground":   ["#09090b", "#e4e4e7"],
    "--color-primary":              ["#7c3aed", "#6d28d9"],
    "--color-primary-foreground":   ["#ffffff", "#ffffff"],
    "--color-secondary":            ["#f4f4f5", "#27272a"],
    "--color-secondary-foreground": ["#09090b", "#e4e4e7"],
    "--color-muted":                ["#f4f4f5", "#27272a"],
    "--color-muted-foreground":     ["#71717a", "#a1a1aa"],
    "--color-accent":               ["#f4f4f5", "#27272a"],
    "--color-accent-foreground":    ["#09090b", "#e4e4e7"],
    "--color-border":               ["#e4e4e7", "#3f3f46"],
    "--color-input":                ["#e4e4e7", "#3f3f46"],
    "--color-sidebar":              ["#fafafa", "#18181b"],
    "--color-sidebar-foreground":   ["#71717a", "#a1a1aa"],

    "--color-syntax-property":      ["#2563eb", "#93c5fd"],
    "--color-syntax-string":        ["#16a34a", "#86efac"],
    "--color-syntax-number":        ["#ca8a04", "#fde68a"],
    "--color-syntax-boolean":       ["#7c3aed", "#c4b5fd"],
    "--color-syntax-null":          ["#dc2626", "#fca5a5"],
  };

  const idx = theme === "light" ? 0 : 1;
  for (const [key, values] of Object.entries(vars)) {
    root.style.setProperty(key, values[idx]);
  }
}
