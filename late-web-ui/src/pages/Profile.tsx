import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getSavedSession, updateProfile, serverLogout, clearSession } from "@/lib/chat-session";
import { useTheme } from "@/providers/theme-provider";
import { UserAvatar } from "@/components/UserAvatar";
import { ThemeSwitcher } from "@/components/ThemeSwitcher";
import { NickPromptModal } from "@/components/NickPromptModal";
import { NotificationSettingsModal } from "@/components/NotificationSettingsModal";
import { CoffeeIcon } from "@/components/AppLoader";
import type { LateUser } from "@/types/window";
import { ArrowLeft, Bell, Edit3, LogOut, Palette, Save, Trash2 } from "lucide-react";

export function Profile() {
  const { mode } = useTheme();
  const isLight = mode === "light";
  const navigate = useNavigate();
  const [user, setUser] = useState<LateUser | null>(() => getSavedSession()?.user ?? null);
  const [avatarInput, setAvatarInput] = useState("");
  const [nameInput, setNameInput] = useState("");
  const [savingAvatar, setSavingAvatar] = useState(false);
  const [savingName, setSavingName] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showNick, setShowNick] = useState(false);
  const [showNotif, setShowNotif] = useState(false);
  const [showTheme, setShowTheme] = useState(false);

  useEffect(() => {
    if (!user) return;
    setAvatarInput(user.avatar_url ?? "");
    setNameInput(user.name ?? "");
  }, [user]);

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <CoffeeIcon className="w-10 h-10 text-slate-500" />
          <p className="text-slate-400 text-sm">Necesitás iniciar sesión para ver tu perfil.</p>
          <button
            type="button"
            onClick={() => (window.location.href = "/api/auth/exchange" as unknown as string)}
            className="px-4 py-2 rounded-lg bg-indigo-500 hover:bg-indigo-400 text-white text-sm"
          >
            Iniciar sesión
          </button>
        </div>
      </div>
    );
  }

  const nick = user.display_name ?? user.email ?? "?";

  const saveAvatar = async () => {
    setError(null);
    setSavingAvatar(true);
    try {
      const next = await updateProfile({
        avatar_url: avatarInput.trim() || null,
      });
      setUser(next);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSavingAvatar(false);
    }
  };

  const saveName = async () => {
    setError(null);
    setSavingName(true);
    try {
      const next = await updateProfile({ name: nameInput.trim() });
      setUser(next);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSavingName(false);
    }
  };

  const clearAvatar = async () => {
    setError(null);
    setSavingAvatar(true);
    try {
      const next = await updateProfile({ avatar_url: null });
      setUser(next);
      setAvatarInput("");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSavingAvatar(false);
    }
  };

  return (
    <div className={`min-h-screen ${isLight ? "bg-slate-50" : "bg-slate-950"}`}>
      <div className="max-w-3xl mx-auto px-4 py-8 space-y-6 animate-menu-up">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className={`p-2 rounded-lg ${
              isLight ? "text-slate-600 hover:bg-slate-200" : "text-slate-300 hover:bg-slate-800"
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
          className={`rounded-2xl border p-6 flex items-center gap-5 ${
            isLight ? "bg-white border-slate-200" : "bg-slate-900 border-slate-800"
          }`}
        >
          <UserAvatar src={user.avatar_url} nick={nick} size="lg" className="w-20 h-20 text-xl" />
          <div className="min-w-0 flex-1">
            <p className="text-lg font-semibold truncate">{nick}</p>
            <p className={`text-sm truncate ${isLight ? "text-slate-500" : "text-slate-400"}`}>
              {user.email}
            </p>
            {user.global_role && user.global_role !== "user" && (
              <span className="inline-block mt-1 text-[10px] uppercase tracking-wider px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300">
                {user.global_role}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={() => setShowNick(true)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm ${
              isLight
                ? "border border-slate-200 hover:bg-slate-100"
                : "border border-slate-700 hover:bg-slate-800"
            }`}
          >
            <Edit3 className="w-4 h-4" />
            Cambiar nick
          </button>
        </section>

        <section
          className={`rounded-2xl border p-6 space-y-4 ${
            isLight ? "bg-white border-slate-200" : "bg-slate-900 border-slate-800"
          }`}
        >
          <h2 className="text-sm font-semibold uppercase tracking-wider opacity-70">Avatar</h2>
          <p className={`text-xs ${isLight ? "text-slate-500" : "text-slate-400"}`}>
            Pegá la URL de tu foto de Supabase (o de cualquier CDN). Si la URL falla o está vacía,
            volvemos a las iniciales.
          </p>
          <div className="flex gap-2">
            <input
              value={avatarInput}
              onChange={(e) => setAvatarInput(e.target.value)}
              placeholder="https://..."
              className={`flex-1 px-3 py-2 rounded-lg border text-sm focus:outline-none focus:border-indigo-500 ${
                isLight
                  ? "bg-slate-50 border-slate-200"
                  : "bg-slate-950 border-slate-700"
              }`}
            />
            <button
              type="button"
              onClick={saveAvatar}
              disabled={savingAvatar}
              className="px-3 py-2 rounded-lg text-sm font-semibold bg-indigo-500 hover:bg-indigo-400 text-white disabled:opacity-60"
            >
              <Save className="w-4 h-4 inline -mt-0.5 mr-1" />
              Guardar
            </button>
            {user.avatar_url && (
              <button
                type="button"
                onClick={clearAvatar}
                disabled={savingAvatar}
                className={`px-3 py-2 rounded-lg text-sm ${
                  isLight
                    ? "border border-slate-200 hover:bg-slate-100"
                    : "border border-slate-700 hover:bg-slate-800"
                }`}
                title="Quitar avatar"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        </section>

        <section
          className={`rounded-2xl border p-6 space-y-4 ${
            isLight ? "bg-white border-slate-200" : "bg-slate-900 border-slate-800"
          }`}
        >
          <h2 className="text-sm font-semibold uppercase tracking-wider opacity-70">Nombre</h2>
          <p className={`text-xs ${isLight ? "text-slate-500" : "text-slate-400"}`}>
            Tu nombre completo. El nick es lo que se ve en el chat.
          </p>
          <div className="flex gap-2">
            <input
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              maxLength={80}
              className={`flex-1 px-3 py-2 rounded-lg border text-sm focus:outline-none focus:border-indigo-500 ${
                isLight
                  ? "bg-slate-50 border-slate-200"
                  : "bg-slate-950 border-slate-700"
              }`}
            />
            <button
              type="button"
              onClick={saveName}
              disabled={savingName}
              className="px-3 py-2 rounded-lg text-sm font-semibold bg-indigo-500 hover:bg-indigo-400 text-white disabled:opacity-60"
            >
              <Save className="w-4 h-4 inline -mt-0.5 mr-1" />
              Guardar
            </button>
          </div>
        </section>

        <section
          className={`rounded-2xl border p-6 grid grid-cols-1 sm:grid-cols-2 gap-3 ${
            isLight ? "bg-white border-slate-200" : "bg-slate-900 border-slate-800"
          }`}
        >
          <button
            type="button"
            onClick={() => setShowNotif(true)}
            className={`flex items-center gap-3 p-3 rounded-xl text-sm ${
              isLight
                ? "border border-slate-200 hover:bg-slate-50"
                : "border border-slate-700 hover:bg-slate-800"
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
                ? "border border-slate-200 hover:bg-slate-50"
                : "border border-slate-700 hover:bg-slate-800"
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
                ? "text-rose-600 border border-rose-200 hover:bg-rose-50"
                : "text-rose-400 border border-rose-500/30 hover:bg-rose-500/10"
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
