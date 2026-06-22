import { create } from "zustand";

export const FONT_SCALE_STORAGE_KEY = "rpccall-font-scale";
export const FONT_SCALE_STEPS = [80, 90, 100, 110, 120, 130, 140, 150] as const;

type FontScale = (typeof FONT_SCALE_STEPS)[number];

interface FontScaleState {
  scale: FontScale;
  increaseFontScale: () => void;
  decreaseFontScale: () => void;
  resetFontScale: () => void;
  setFontScale: (scale: number) => void;
}

function normalizeScale(scale: number): FontScale {
  let best: FontScale = 100;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const step of FONT_SCALE_STEPS) {
    const distance = Math.abs(step - scale);
    if (distance < bestDistance) {
      best = step;
      bestDistance = distance;
    }
  }
  return best;
}

function loadInitialScale(): FontScale {
  if (typeof window === "undefined") return 100;
  const raw = window.localStorage.getItem(FONT_SCALE_STORAGE_KEY);
  const parsed = raw ? Number.parseInt(raw, 10) : 100;
  return normalizeScale(Number.isFinite(parsed) ? parsed : 100);
}

function applyFontScale(scale: FontScale) {
  document.documentElement.style.setProperty("--app-font-scale", String(scale / 100));
  window.localStorage.setItem(FONT_SCALE_STORAGE_KEY, String(scale));
}

function nextScale(scale: FontScale, direction: 1 | -1): FontScale {
  const index = FONT_SCALE_STEPS.indexOf(scale);
  const nextIndex = Math.max(0, Math.min(FONT_SCALE_STEPS.length - 1, index + direction));
  return FONT_SCALE_STEPS[nextIndex];
}

const initialScale = loadInitialScale();
if (typeof document !== "undefined") {
  applyFontScale(initialScale);
}

export const useFontScaleStore = create<FontScaleState>((set) => ({
  scale: loadInitialScale(),
  increaseFontScale: () =>
    set((state) => {
      const scale = nextScale(state.scale, 1);
      applyFontScale(scale);
      return { scale };
    }),
  decreaseFontScale: () =>
    set((state) => {
      const scale = nextScale(state.scale, -1);
      applyFontScale(scale);
      return { scale };
    }),
  resetFontScale: () => {
    applyFontScale(100);
    set({ scale: 100 });
  },
  setFontScale: (value) => {
    const scale = normalizeScale(value);
    applyFontScale(scale);
    set({ scale });
  },
}));
