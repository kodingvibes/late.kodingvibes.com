import { createContext, useCallback, useContext, useEffect, useState } from "react";

export type ThemeMode = "light" | "dark";
export type AccentName = "indigo" | "violet" | "emerald" | "rose" | "amber" | "cyan";

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

const ACCENT_VARS: Record<AccentName, { primary: string; soft: string; ring: string }> = {
  indigo: { primary: "#6366f1", soft: "#818cf8", ring: "#a5b4fc" },
  violet: { primary: "#8b5cf6", soft: "#a78bfa", ring: "#c4b5fd" },
  emerald: { primary: "#10b981", soft: "#34d399", ring: "#6ee7b7" },
  rose: { primary: "#f43f5e", soft: "#fb7185", ring: "#fda4af" },
  amber: { primary: "#f59e0b", soft: "#fbbf24", ring: "#fcd34d" },
  cyan: { primary: "#06b6d4", soft: "#22d3ee", ring: "#67e8f9" },
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
