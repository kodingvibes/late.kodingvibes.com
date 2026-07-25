import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { AccentName as AccentNameType, LateTheme, ThemeMode as ThemeModeType } from "@/types/window";

export type ThemeMode = ThemeModeType;
export type AccentName = AccentNameType;

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

const ACCENT_VARS: Record<
  AccentName,
  {
    primary: string;
    soft: string;
    ring: string;
    glowA: string;
    glowB: string;
    glowALight: string;
    glowBLight: string;
  }
> = {
  indigo: { primary: "#6366f1", soft: "#818cf8", ring: "#a5b4fc", glowA: "rgba(99,102,241,0.18)", glowB: "rgba(99,102,241,0.12)", glowALight: "rgba(79,70,229,0.16)", glowBLight: "rgba(99,102,241,0.10)" },
  violet: { primary: "#8b5cf6", soft: "#a78bfa", ring: "#c4b5fd", glowA: "rgba(139,92,246,0.18)", glowB: "rgba(139,92,246,0.12)", glowALight: "rgba(124,58,237,0.16)", glowBLight: "rgba(139,92,246,0.10)" },
  emerald: { primary: "#10b981", soft: "#34d399", ring: "#6ee7b7", glowA: "rgba(16,185,129,0.18)", glowB: "rgba(16,185,129,0.12)", glowALight: "rgba(5,150,105,0.16)", glowBLight: "rgba(16,185,129,0.10)" },
  rose: { primary: "#f43f5e", soft: "#fb7185", ring: "#fda4af", glowA: "rgba(244,63,94,0.18)", glowB: "rgba(244,63,94,0.12)", glowALight: "rgba(225,29,72,0.16)", glowBLight: "rgba(244,63,94,0.10)" },
  amber: { primary: "#f59e0b", soft: "#fbbf24", ring: "#fcd34d", glowA: "rgba(245,158,11,0.18)", glowB: "rgba(245,158,11,0.12)", glowALight: "rgba(217,119,6,0.16)", glowBLight: "rgba(245,158,11,0.10)" },
  cyan: { primary: "#06b6d4", soft: "#22d3ee", ring: "#67e8f9", glowA: "rgba(6,182,212,0.18)", glowB: "rgba(6,182,212,0.12)", glowALight: "rgba(8,145,178,0.16)", glowBLight: "rgba(6,182,212,0.10)" },
};

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
  root.classList.toggle("theme-light", state.mode === "light");
  root.classList.toggle("theme-dark", state.mode === "dark");
  const vars = ACCENT_VARS[state.accent];
  root.style.setProperty("--accent-primary", vars.primary);
  root.style.setProperty("--accent-soft", vars.soft);
  root.style.setProperty("--accent-ring", vars.ring);
  // ponytail: pre-baked rgba tones (no color-mix in the
  // gradient stop), so the page-level halo always renders at
  // the intended opacity. The Lightning CSS minifier
  // collapses `color-mix(in srgb, X N%, transparent)` to
  // `X 0%` inside gradient stops, so we ship the rgba
  // directly from JS. The light pair is a touch deeper
  // because the white backdrop washes the colour out.
  root.style.setProperty("--accent-glow-a", vars.glowA);
  root.style.setProperty("--accent-glow-b", vars.glowB);
  root.style.setProperty("--accent-glow-a-light", vars.glowALight);
  root.style.setProperty("--accent-glow-b-light", vars.glowBLight);
  // ponytail: the shell publishes the active theme on
  // window.LateTheme + dispatches `late:theme-change` so the
  // micro-fronts (chat, radio, dashboard) can mirror the
  // exact mode + accent without shipping their own provider.
  // The MFs subscribe to the event and read window.LateTheme
  // synchronously on mount.
  const snapshot: LateTheme = {
    mode: state.mode,
    accent: state.accent,
    accentPrimary: vars.primary,
    accentSoft: vars.soft,
    accentRing: vars.ring,
    accentGlowA: vars.glowA,
    accentGlowB: vars.glowB,
    accentGlowALight: vars.glowALight,
    accentGlowBLight: vars.glowBLight,
  };
  try {
    (window as unknown as { LateTheme?: LateTheme }).LateTheme = snapshot;
    window.dispatchEvent(new CustomEvent<LateTheme>("late:theme-change", { detail: snapshot }));
  } catch {
    /* ignore — older browsers / SSR */
  }
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<ThemeState>({ mode: "dark", accent: "indigo" });
  const [mounted, setMounted] = useState(false);

  // ponytail: first render assumes dark+indigo so SSR + first paint
  // never flash a wrong theme. After mount we read the persisted
  // choice and apply it. Subscribers can also receive a user profile
  // blob (from late-auth /me) that overrides localStorage.
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

export const ACCENT_NAMES = Object.keys(ACCENT_VARS) as AccentName[];
