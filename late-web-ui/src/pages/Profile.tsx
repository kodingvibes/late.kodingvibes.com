import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  getSavedSession,
  serverLogout,
  clearSession,
} from "@/lib/chat-session";
import { useTheme } from "@/providers/theme-provider";
import { UserAvatar } from "@/components/UserAvatar";
import { ThemeSwitcher } from "@/components/ThemeSwitcher";
import { NickPromptModal } from "@/components/NickPromptModal";
import { NotificationSettingsModal } from "@/components/NotificationSettingsModal";
import { CoffeeIcon } from "@/components/AppLoader";
import type { LateUser } from "@/types/window";
import { ArrowLeft, Bell, Edit3, LogOut, Palette, Trash2, Upload } from "lucide-react";

const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
const ALLOWED_AVATAR_MIME = ["image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif"];

// Can't reuse lib/chat-session.ts's api() helper here — it hardcodes
// Content-Type: application/json, which would break the multipart FormData body.
function authHeaders(): HeadersInit | undefined {
  const sessionId = getSavedSession()?.session_id;
  return sessionId ? { Authorization: `Bearer ${sessionId}` } : undefined;
}

export function Profile() {
  const { mode } = useTheme();
  const isLight = mode === "light";
  const navigate = useNavigate();
  const [user, setUser] = useState<LateUser | null>(() => getSavedSession()?.user ?? null);
  const [showNick, setShowNick] = useState(false);
  const [showNotif, setShowNotif] = useState(false);
  const [showTheme, setShowTheme] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!user) return;
    // The page revs a `?cb=` on the avatar URL to bust caches
    // when the user replaces their picture. We mirror that
    // here so the header chip + the profile picture stay in
    // sync immediately after a save.
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [user, previewUrl]);

  // ponytail: pick up session changes that happen while the
  // page is open (e.g. avatar upload finishes, the header
  // chip and the profile picture need to match).
  useEffect(() => {
    const onLocal = () => setUser(getSavedSession()?.user ?? null);
    window.addEventListener("late:session-change", onLocal);
    return () => window.removeEventListener("late:session-change", onLocal);
  }, []);

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <CoffeeIcon className="w-10 h-10 text-slate-500" />
          <p className="text-slate-400 text-sm">Necesitás iniciar sesión para ver tu perfil.</p>
          <button
            type="button"
            onClick={() => (window.location.href = "/api/auth/exchange" as unknown as string)}
            className="px-4 py-2 rounded-lg bg-accent hover:bg-accent-soft text-white text-sm"
          >
            Iniciar sesión
          </button>
        </div>
      </div>
    );
  }

  const nick = user.display_name ?? user.email ?? "?";

  const pickAvatar = () => {
    fileInputRef.current?.click();
  };

  const handleFile = async (file: File | null) => {
    if (!file) return;
    if (file.size > MAX_AVATAR_BYTES) {
      setError(`La imagen es demasiado grande (${(file.size / 1024 / 1024).toFixed(1)} MB, máximo 2 MB).`);
      return;
    }
    if (!ALLOWED_AVATAR_MIME.includes(file.type)) {
      setError(`Formato no soportado: ${file.type || "desconocido"}. Usá PNG, JPG, WEBP o GIF.`);
      return;
    }
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(URL.createObjectURL(file));
    setError(null);
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/auth/me/avatar", {
        method: "POST",
        headers: authHeaders(),
        body: form,
      });
      if (!res.ok) {
        const detail = await res.json().catch(() => ({}));
        throw new Error(detail.detail || `upload failed: ${res.status}`);
      }
      const next = (await res.json()) as LateUser;
      setUser(next);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setUploading(false);
    }
  };

  const removeAvatar = async () => {
    setError(null);
    setRemoving(true);
    try {
      const res = await fetch("/api/auth/me/avatar", { method: "DELETE", headers: authHeaders() });
      if (!res.ok) {
        const detail = await res.json().catch(() => ({}));
        throw new Error(detail.detail || `remove failed: ${res.status}`);
      }
      const next = (await res.json()) as LateUser;
      setUser(next);
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
        setPreviewUrl(null);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setRemoving(false);
    }
  };

  return (
    <div className={`relative min-h-screen`}>
      {/* ponytail: a faint accent halo behind the profile so the
       * chosen colour tints the page surface. The gradient
       * tracks --accent-primary so picking rose / amber /
       * emerald actually tints the backdrop. */}
      <div
        className={`pointer-events-none absolute inset-x-0 top-0 h-[420px] -z-10 ${isLight ? "bg-accent-glow" : "bg-accent-glow opacity-20"}`}
        aria-hidden="true"
      />
      <div className="max-w-3xl mx-auto px-4 py-8 space-y-6 animate-menu-up">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className={`p-2 rounded-lg ${
              isLight ? "text-slate-600 hover:bg-accent/15" : "text-slate-300 hover:bg-accent/15"
            }`}
            aria-label="Volver"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <h1 className={`text-2xl font-bold ${isLight ? "text-slate-900" : "text-slate-100"}`}>
            Mi perfil
          </h1>
        </div>

        <section
          className={`rounded-2xl p-6 flex items-center gap-5 backdrop-blur-sm ${
            isLight ? "bg-white/70 " : "bg-surface-2 "
          }`}
        >
          <UserAvatar src={user.avatar_url} nick={nick} size="lg" className="w-20 h-20 text-xl" />
          <div className="min-w-0 flex-1">
            <p className="text-lg font-semibold truncate">{nick}</p>
            <p className={`text-sm truncate ${isLight ? "text-slate-500" : "text-slate-400"}`}>
              {user.email}
            </p>
            {user.global_role && user.global_role !== "user" && (
              <span className="inline-block mt-1 text-[10px] uppercase tracking-wider px-2 py-0.5 rounded bg-accent/20 text-accent">
                {user.global_role}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={() => setShowNick(true)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm ${
              isLight
                ? "border  hover:bg-surface-tint-80"
                : "border  hover:bg-accent/15"
            }`}
          >
            <Edit3 className="w-4 h-4" />
            Cambiar nick
          </button>
        </section>

        <section
          className={`rounded-2xl p-6 space-y-4 backdrop-blur-sm ${
            isLight ? "bg-white/70 " : "bg-surface-2 "
          }`}
        >
          <h2 className="text-sm font-semibold uppercase tracking-wider opacity-70">Avatar</h2>
          <p className={`text-xs ${isLight ? "text-slate-500" : "text-slate-400"}`}>
            Subí una imagen desde tu dispositivo. PNG, JPG, WEBP o GIF, hasta 2 MB.
          </p>
          <div className="flex items-center gap-3 flex-wrap">
            <input
              ref={fileInputRef}
              type="file"
              accept={ALLOWED_AVATAR_MIME.join(",")}
              className="hidden"
              onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
            />
            <button
              type="button"
              onClick={pickAvatar}
              disabled={uploading || removing}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold bg-accent hover:bg-accent-soft text-white disabled:opacity-60"
            >
              <Upload className="w-4 h-4" />
              {uploading ? "Subiendo..." : user.avatar_url ? "Reemplazar" : "Subir imagen"}
            </button>
            {user.avatar_url && (
              <button
                type="button"
                onClick={removeAvatar}
                disabled={uploading || removing}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${
                  isLight
                    ? "border  hover:bg-surface-tint-80"
                    : "border  hover:bg-accent/15"
                }`}
              >
                <Trash2 className="w-4 h-4" />
                {removing ? "Quitando..." : "Quitar avatar"}
              </button>
            )}
            {previewUrl && (
              <span className={`text-xs ${isLight ? "text-slate-500" : "text-slate-400"}`}>
                Previsualizando archivo nuevo...
              </span>
            )}
          </div>
        </section>

        <section
          className={`rounded-2xl p-6 grid grid-cols-1 sm:grid-cols-2 gap-3 backdrop-blur-sm ${
            isLight ? "bg-white/70 " : "bg-surface-2 "
          }`}
        >
          <button
            type="button"
            onClick={() => setShowNotif(true)}
            className={`flex items-center gap-3 p-3 rounded-xl text-sm ${
              isLight
                ? "border  hover:bg-surface-tint-80"
                : "border  hover:bg-accent/15"
            }`}
          >
            <Bell className="w-4 h-4" />
            Notificaciones
          </button>
          <button
            type="button"
            onClick={() => setShowTheme(true)}
            className={`flex items-center gap-3 p-3 rounded-xl text-sm ${
              isLight
                ? "border  hover:bg-surface-tint-80"
                : "border  hover:bg-accent/15"
            }`}
          >
            <Palette className="w-4 h-4" />
            Tema
          </button>
        </section>

        {error && <p className="text-rose-400 text-sm">{error}</p>}

        <div className="flex justify-end">
          <button
            type="button"
            onClick={async () => {
              await serverLogout();
              clearSession();
              window.location.href = "/irc?logout=1";
            }}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm ${
              isLight
                ? "text-rose-600  hover:bg-rose-50"
                : "text-rose-400  hover:bg-rose-500/10"
            }`}
          >
            <LogOut className="w-4 h-4" />
            Cerrar sesión
          </button>
        </div>
      </div>

      <NotificationSettingsModal open={showNotif} onClose={() => setShowNotif(false)} />
      <NickPromptModal
        open={showNick}
        initialValue={user.display_name}
        onClose={() => setShowNick(false)}
        onSaved={(n) => setUser((prev) => (prev ? { ...prev, display_name: n } : prev))}
      />
      {showTheme && <ThemeSwitcher onClose={() => setShowTheme(false)} />}
    </div>
  );
}
