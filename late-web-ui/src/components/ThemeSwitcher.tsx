import { useEffect, useRef } from "react";
import { Check, Sun, Moon, Palette } from "lucide-react";
import { useTheme, ACCENT_NAMES, AccentName } from "@/providers/theme-provider";

interface ThemeSwitcherProps {
  onClose: () => void;
}

const ACCENT_SWATCHES: Record<AccentName, string> = {
  indigo: "#6366f1",
  violet: "#8b5cf6",
  emerald: "#10b981",
  rose: "#f43f5e",
  amber: "#f59e0b",
  cyan: "#06b6d4",
};

export function ThemeSwitcher({ onClose }: ThemeSwitcherProps) {
  const { mode, accent, setMode, setAccent } = useTheme();
  const isLight = mode === "light";
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-menu-backdrop"
      onClick={onClose}
    >
      <div
        ref={ref}
        className={`w-full max-w-sm rounded-2xl border shadow-2xl overflow-hidden animate-menu-pop backdrop-blur-md ${
          isLight ? "bg-white/80 border-slate-300/60" : "bg-slate-900/75 border-slate-700/60"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className={`flex items-center gap-2 px-5 py-3 border-b ${
            isLight ? "border-slate-300/60" : "border-slate-700/60"
          }`}
        >
          <Palette className="w-4 h-4" />
          <h2 className="text-base font-semibold">Tema</h2>
        </div>

        <div className="p-5 space-y-5">
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider opacity-70">
              Modo
            </label>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setMode("light")}
                className={`flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
                  mode === "light"
                    ? "bg-accent/20 border-accent text-accent"
                    : isLight
                    ? "border-slate-300/60 hover:bg-slate-50/70"
                    : "border-slate-700/60 hover:bg-slate-800/50"
                }`}
              >
                <Sun className="w-4 h-4" />
                Claro
              </button>
              <button
                type="button"
                onClick={() => setMode("dark")}
                className={`flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
                  mode === "dark"
                    ? "bg-accent/20 border-accent text-accent"
                    : isLight
                    ? "border-slate-300/60 hover:bg-slate-50/70"
                    : "border-slate-700/60 hover:bg-slate-800/50"
                }`}
              >
                <Moon className="w-4 h-4" />
                Oscuro
              </button>
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold uppercase tracking-wider opacity-70">
              Color de acento
            </label>
            <div className="mt-2 grid grid-cols-6 gap-2">
              {ACCENT_NAMES.map((name) => (
                <button
                  key={name}
                  type="button"
                  onClick={() => setAccent(name)}
                  className={`h-10 rounded-lg flex items-center justify-center border-2 transition-all ${
                    accent === name
                      ? "border-slate-100 scale-110"
                      : "border-transparent"
                  }`}
                  style={{ backgroundColor: ACCENT_SWATCHES[name] }}
                  title={name}
                  aria-label={`Acento ${name}`}
                >
                  {accent === name && <Check className="w-4 h-4 text-white" />}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div
          className={`flex justify-end px-5 py-3 border-t ${
            isLight ? "border-slate-300/60 bg-slate-50/70" : "border-slate-700/60 bg-slate-900/60"
          }`}
        >
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg text-sm bg-accent hover:bg-accent-soft text-white"
          >
            Listo
          </button>
        </div>
      </div>
    </div>
  );
}
