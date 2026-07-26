import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  Bell,
  LogOut,
  Palette,
  Settings as SettingsIcon,
  User as UserIcon,
  ChevronDown,
} from "lucide-react";
import { getSavedSession } from "@/lib/chat-session";

const SESSION_KEY = "late.session";
import { UserAvatar } from "./UserAvatar";
import { NotificationSettingsModal } from "./NotificationSettingsModal";
import { NickPromptModal } from "./NickPromptModal";
import { ThemeSwitcher } from "./ThemeSwitcher";
import { useTheme } from "@/providers/theme-provider";
import type { LateUser } from "@/types/window";

export function UserMenu() {
  const { mode } = useTheme();
  const isLight = mode === "light";
  const [user, setUser] = useState<LateUser | null>(() => getSavedSession()?.user ?? null);
  const [open, setOpen] = useState(false);
  const [showNotif, setShowNotif] = useState(false);
  const [showNick, setShowNick] = useState(false);
  const [showTheme, setShowTheme] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // ponytail: re-read the user whenever the local session changes
  // — login (saveSession), logout (clearSession), or any tab
  // picking up a fresh /me refresh from validateSession. We listen
  // on both `storage` (cross-tab) and the in-process
  // `late:session-change` event (same window) because localStorage
  // writes do NOT fire `storage` in the writer window — only in
  // other tabs. Without the in-process event the avatar would
  // stay blank after a fresh login until the user reloaded.
  useEffect(() => {
    const refresh = () => setUser(getSavedSession()?.user ?? null);
    const onStorage = (e: StorageEvent) => {
      if (e.key === SESSION_KEY || e.key === null) refresh();
    };
    const onLocal = () => refresh();
    window.addEventListener("storage", onStorage);
    window.addEventListener("late:session-change", onLocal);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("late:session-change", onLocal);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!user) return null;

  const nick = user.display_name ?? user.email ?? "?";

  const doLogout = () => {
    if (typeof window !== "undefined") {
      window.LateSession?.logout();
    }
  };

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-1.5 pl-1 pr-2 py-1 rounded-lg transition-colors ${
          open
            ? "bg-accent/15 ring-1 ring-accent/30"
            : isLight
            ? "hover:bg-slate-100"
            : "hover:bg-slate-800"
        }`}
        aria-label="Menú de usuario"
        aria-expanded={open}
      >
        <UserAvatar src={user.avatar_url} nick={nick} size="sm" />
        <span
          className={`hidden sm:inline text-sm font-medium truncate max-w-[10rem] ${
            isLight ? "text-slate-700" : "text-slate-200"
          }`}
        >
          {nick}
        </span>
        <ChevronDown className={`w-3.5 h-3.5 ${isLight ? "text-slate-500" : "text-slate-400"}`} />
      </button>

      {open && (
        <div
          className={`absolute right-0 mt-2 w-64 rounded-xl border shadow-accent overflow-hidden z-50 animate-menu-drop backdrop-blur-md ${
            isLight
              ? "bg-white/75 border-accent/30"
              : "bg-surface-3 border-accent/30"
          }`}
        >
          <div
            className={`flex items-center gap-3 px-3 py-3 border-b ${
              isLight ? "border-slate-200/60" : "border-slate-800/60"
            }`}
          >
            <UserAvatar src={user.avatar_url} nick={nick} size="md" />
            <div className="min-w-0">
              <p className="text-sm font-semibold truncate">{nick}</p>
              <p className={`text-xs truncate ${isLight ? "text-slate-500" : "text-slate-400"}`}>
                {user.email}
              </p>
            </div>
          </div>

          <div className="py-1">
            <Link
              to="/profile"
              onClick={() => setOpen(false)}
              className={`w-full flex items-center gap-3 px-3 py-2 text-sm transition-colors ${
                isLight ? "text-slate-700 hover:bg-slate-100/70" : "text-slate-200 hover:bg-slate-800/50"
              }`}
            >
              <UserIcon className="w-4 h-4" />
              Perfil
            </Link>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setShowNick(true);
              }}
              className={`w-full flex items-center gap-3 px-3 py-2 text-sm transition-colors ${
                isLight ? "text-slate-700 hover:bg-slate-100/70" : "text-slate-200 hover:bg-slate-800/50"
              }`}
            >
              <SettingsIcon className="w-4 h-4" />
              Cambiar nick
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setShowNotif(true);
              }}
              className={`w-full flex items-center gap-3 px-3 py-2 text-sm transition-colors ${
                isLight ? "text-slate-700 hover:bg-slate-100/70" : "text-slate-200 hover:bg-slate-800/50"
              }`}
            >
              <Bell className="w-4 h-4" />
              Notificaciones
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setShowTheme(true);
              }}
              className={`w-full flex items-center gap-3 px-3 py-2 text-sm transition-colors ${
                isLight ? "text-slate-700 hover:bg-slate-100/70" : "text-slate-200 hover:bg-slate-800/50"
              }`}
            >
              <Palette className="w-4 h-4" />
              Tema
            </button>
          </div>

          <div
            className={`border-t py-1 ${
              isLight ? "border-slate-200/60" : "border-slate-800/60"
            }`}
          >
            <button
              type="button"
              onClick={doLogout}
              className={`w-full flex items-center gap-3 px-3 py-2 text-sm transition-colors ${
                isLight
                  ? "text-rose-600 hover:bg-rose-50"
                  : "text-rose-400 hover:bg-rose-500/10"
              }`}
            >
              <LogOut className="w-4 h-4" />
              Cerrar sesión
            </button>
          </div>
        </div>
      )}

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
