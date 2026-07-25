import { useEffect, useState } from "react";
import { X, User as UserIcon } from "lucide-react";
import { updateProfile } from "@/lib/chat-session";
import { useTheme } from "@/providers/theme-provider";

interface NickPromptModalProps {
  open: boolean;
  initialValue?: string | null;
  onClose: () => void;
  /** Called after a successful save. The fresh user dict is
   *  already in localStorage by the time this fires. */
  onSaved?: (nick: string) => void;
}

export function NickPromptModal({ open, initialValue, onClose, onSaved }: NickPromptModalProps) {
  const { mode } = useTheme();
  const isLight = mode === "light";
  const [value, setValue] = useState(initialValue ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setValue(initialValue ?? "");
      setError(null);
    }
  }, [open, initialValue]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const save = async () => {
    const trimmed = value.trim();
    if (!trimmed) {
      setError("El nick no puede estar vacío");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const me = await updateProfile({ display_name: trimmed });
      onSaved?.(me.display_name ?? trimmed);
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
        className={`w-full max-w-sm rounded-2xl border shadow-2xl overflow-hidden animate-menu-pop ${
          isLight ? "bg-white border-slate-200" : "bg-slate-900 border-slate-700"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className={`flex items-center justify-between px-5 py-3 border-b ${
            isLight ? "border-slate-200" : "border-slate-700"
          }`}
        >
          <h2 className="text-base font-semibold flex items-center gap-2">
            <UserIcon className="w-4 h-4" />
            Cambiar nick
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
        <div className="p-5 space-y-3">
          <p className={`text-sm ${isLight ? "text-slate-600" : "text-slate-400"}`}>
            Tu nick es el nombre que se muestra a los demás en los canales.
          </p>
          <input
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") save();
            }}
            className={`w-full px-3 py-2 rounded-lg border text-sm font-mono focus:outline-none focus:border-indigo-500 ${
              isLight
                ? "bg-slate-50 border-slate-200"
                : "bg-slate-950 border-slate-700"
            }`}
            placeholder="nuevo-nick"
            maxLength={32}
          />
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
