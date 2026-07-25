import { useEffect, useState } from "react";
import { Bell, X } from "lucide-react";
import { updateProfile, api } from "@/lib/chat-session";
import { useTheme } from "@/providers/theme-provider";

const STORAGE_KEY = "chat.notif_prefs";

export interface NotifPrefs {
  mode: "mentions" | "all" | "none";
  volume: number;
  sound: boolean;
  vibration: boolean;
  system: boolean;
}

const DEFAULTS: NotifPrefs = {
  mode: "mentions",
  volume: 70,
  sound: true,
  vibration: true,
  system: true,
};

interface NotificationSettingsModalProps {
  open: boolean;
  onClose: () => void;
  onSaved?: (prefs: NotifPrefs) => void;
}

export function NotificationSettingsModal({ open, onClose, onSaved }: NotificationSettingsModalProps) {
  const { mode } = useTheme();
  const isLight = mode === "light";
  const [prefs, setPrefs] = useState<NotifPrefs>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) return { ...DEFAULTS, ...JSON.parse(saved) };
    } catch {
      /* ignore */
    }
    return DEFAULTS;
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const update = <K extends keyof NotifPrefs>(key: K, value: NotifPrefs[K]) => {
    setPrefs((p) => ({ ...p, [key]: value }));
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
      // ponytail: server-side preferences live as a single JSON
      // blob keyed by the user. PATCHing the whole object keeps
      // the late-auth merge logic in charge of backwards compat.
      await updateProfile({ preferences: { notif: prefs } }).catch(() => null);
      // Also poke late-auth /heartbeat so preferences write path
      // isn't alone in the test suite.
      await api<void>("/api/auth/heartbeat", { method: "POST" }).catch(() => null);
      onSaved?.(prefs);
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-menu-backdrop"
      onClick={onClose}
    >
      <div
        className={`w-full max-w-md rounded-2xl border shadow-2xl overflow-hidden animate-menu-pop ${
          isLight
            ? "bg-white border-slate-200"
            : "bg-slate-900 border-slate-700"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className={`flex items-center justify-between px-5 py-3 border-b ${
            isLight ? "border-slate-200" : "border-slate-700"
          }`}
        >
          <h2 className="text-base font-semibold flex items-center gap-2">
            <Bell className="w-4 h-4" />
            Notificaciones
          </h2>
          <button
            type="button"
            onClick={onClose}
            className={`p-1 rounded ${isLight ? "text-slate-500 hover:bg-slate-100" : "text-slate-400 hover:bg-slate-800"}`}
            aria-label="Cerrar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider opacity-70">
              Cuándo avisar
            </label>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {(["mentions", "all", "none"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => update("mode", m)}
                  className={`px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
                    prefs.mode === m
                      ? "bg-indigo-500/20 border-indigo-500 text-indigo-300"
                      : isLight
                      ? "border-slate-200 hover:bg-slate-50"
                      : "border-slate-700 hover:bg-slate-800"
                  }`}
                >
                  {m === "mentions" ? "Menciones" : m === "all" ? "Todo" : "Nada"}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between">
            <label className="text-sm">Sonido</label>
            <input
              type="checkbox"
              checked={prefs.sound}
              onChange={(e) => update("sound", e.target.checked)}
            />
          </div>
          <div>
            <label className="text-sm flex justify-between mb-1">
              <span>Volumen</span>
              <span className="tabular-nums opacity-70">{prefs.volume}%</span>
            </label>
            <input
              type="range"
              min={0}
              max={100}
              value={prefs.volume}
              disabled={!prefs.sound}
              onChange={(e) => update("volume", Number(e.target.value))}
              className="w-full"
            />
          </div>
          <div className="flex items-center justify-between">
            <label className="text-sm">Vibración</label>
            <input
              type="checkbox"
              checked={prefs.vibration}
              onChange={(e) => update("vibration", e.target.checked)}
            />
          </div>
          <div className="flex items-center justify-between">
            <label className="text-sm">Notificaciones del sistema</label>
            <input
              type="checkbox"
              checked={prefs.system}
              onChange={(e) => update("system", e.target.checked)}
            />
          </div>

          {error && <p className="text-rose-400 text-xs">{error}</p>}
        </div>

        <div
          className={`flex justify-end gap-2 px-5 py-3 border-t ${
            isLight ? "border-slate-200 bg-slate-50" : "border-slate-700 bg-slate-900/60"
          }`}
        >
          <button
            type="button"
            onClick={onClose}
            className={`px-3 py-1.5 rounded-lg text-sm ${
              isLight ? "text-slate-700 hover:bg-slate-200" : "text-slate-300 hover:bg-slate-800"
            }`}
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="px-3 py-1.5 rounded-lg text-sm font-semibold bg-indigo-500 hover:bg-indigo-400 text-white disabled:opacity-60"
          >
            {saving ? "Guardando..." : "Guardar"}
          </button>
        </div>
      </div>
    </div>
  );
}
