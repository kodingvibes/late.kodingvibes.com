import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { AccentName, LateTheme, ThemeMode } from "@late/theme";
import { ACCENT_VARS, ACCENT_NAMES } from "@late/theme";

export type { ThemeMode, AccentName };

export interface ThemeState {
  mode: ThemeMode;
  accent: AccentName;
}

interface ThemeContextValue extends ThemeState {
  setMode: (m: ThemeMode) => void;
  setAccent: (a: AccentName) => void;
  toggleMode: () => void;
  mounted: boolean;
}

const STORAGE_KEY = "late.theme";

const ThemeContext = createContext<ThemeContextValue | null>(null);

function readSaved(): ThemeState {
  if (typeof window === "undefined") return { mode: "dark", accent: "indigo" };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      const mode: ThemeMode = parsed.mode === "light" ? "light" : "dark";
      const accent = ACCENT_VARS[parsed.accent as AccentName]
        ? (parsed.accent as AccentName)
        : "indigo";
      return { mode, accent };
    }
  } catch {
    /* ignore */
  }
  return { mode: "dark", accent: "indigo" };
}

function applyTheme(state: ThemeState) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const isLight = state.mode === "light";
  root.classList.toggle("theme-light", isLight);
  root.classList.toggle("theme-dark", !isLight);
  const vars = ACCENT_VARS[state.accent];
  root.style.setProperty("--accent-primary", isLight ? vars.primaryLight : vars.primary);
  root.style.setProperty("--accent-soft", isLight ? vars.softLight : vars.soft);
  root.style.setProperty("--accent-ring", isLight ? vars.ringLight : vars.ring);
  root.style.setProperty("--accent-glow-a", vars.glowA);
  root.style.setProperty("--accent-glow-b", vars.glowB);
  root.style.setProperty("--accent-glow-a-light", vars.glowALight);
  root.style.setProperty("--accent-glow-b-light", vars.glowBLight);
  const snapshot: LateTheme = {
    mode: state.mode,
    accent: state.accent,
    accentPrimary: isLight ? vars.primaryLight : vars.primary,
    accentSoft: isLight ? vars.softLight : vars.soft,
    accentRing: isLight ? vars.ringLight : vars.ring,
    accentGlowA: vars.glowA,
    accentGlowB: vars.glowB,
    accentGlowALight: vars.glowALight,
    accentGlowBLight: vars.glowBLight,
  };
  try {
    (window as unknown as { LateTheme?: LateTheme }).LateTheme = snapshot;
    window.dispatchEvent(new CustomEvent<LateTheme>("late:theme-change", { detail: snapshot }));
  } catch {
    /* ignore */
  }
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<ThemeState>({ mode: "dark", accent: "indigo" });
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const saved = readSaved();
    setState(saved);
    applyTheme(saved);
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    applyTheme(state);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      /* ignore */
    }
  }, [state, mounted]);

  const setMode = useCallback((mode: ThemeMode) => {
    setState((prev) => ({ ...prev, mode }));
  }, []);

  const setAccent = useCallback((accent: AccentName) => {
    setState((prev) => ({ ...prev, accent }));
  }, []);

  const toggleMode = useCallback(() => {
    setState((prev) => ({ ...prev, mode: prev.mode === "light" ? "dark" : "light" }));
  }, []);

  return (
    <ThemeContext.Provider value={{ ...state, setMode, setAccent, toggleMode, mounted }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside <ThemeProvider>");
  return ctx;
}

export { ACCENT_NAMES };
