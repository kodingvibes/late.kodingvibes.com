import { Link, useLocation } from "react-router-dom";
import { Radio, MessageCircle, Briefcase, Gamepad2, MessageSquareQuote, Sparkles, UserCircle, Menu, X } from "lucide-react";
import { useEffect, useState, useRef } from "react";
import { CoffeeIcon } from "./AppLoader";
import { UserMenu } from "./UserMenu";
import { useTheme } from "@/providers/theme-provider";

export default function SiteHeader() {
  const loc = useLocation();
  const { mode } = useTheme();
  const isLight = mode === "light";
  const [onlineCount, setOnlineCount] = useState<number | null>(null);
  const [hamburgerOpen, setHamburgerOpen] = useState(false);
  const hamburgerRef = useRef<HTMLDivElement>(null);

  // ponytail: the chat microfrontend publishes the latest
  // global online count on window.ChatEngine.onlineCount. We
  // poll briefly so we don't miss updates that fire while the
  // user is on /icecast. The badge only shows on /irc; on other
  // routes the same icon still works.
  useEffect(() => {
    const read = () => {
      const c = window.ChatEngine?.onlineCount;
      setOnlineCount(typeof c === "number" ? c : null);
    };
    read();
    const id = window.setInterval(read, 4000);
    return () => window.clearInterval(id);
  }, []);

  const isChat = loc.pathname.startsWith("/irc");
  const isRadio = loc.pathname.startsWith("/icecast");
  const isGames = loc.pathname.startsWith("/games");
  const isApps = ["/profiles", "/freelance", "/forum", "/trivia"].some((p) =>
    loc.pathname.startsWith(p),
  );

  // close hamburger on route change
  useEffect(() => {
    setHamburgerOpen(false);
  }, [loc.pathname]);

  // close hamburger on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (hamburgerRef.current && !hamburgerRef.current.contains(e.target as Node)) {
        setHamburgerOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const baseLink = isLight
    ? "text-slate-500 hover:text-slate-900 hover:bg-slate-200"
    : "text-slate-400 hover:text-slate-100 hover:bg-slate-800";
  const activeLink =
    "bg-accent/15 text-accent ring-1 ring-accent/30 shadow-accent";

  return (
    <header
      className={`sticky top-0 z-40 backdrop-blur border-b ${
        isLight
          ? "bg-white/70 border-accent/25"
          : "bg-slate-950/50 border-accent/25"
      }`}
    >
      <div className="max-w-7xl mx-auto px-3 sm:px-6 h-11 sm:h-14 flex items-center justify-between gap-2 sm:gap-3">
        <Link
          to="/"
          className="flex items-center gap-1.5 sm:gap-2 group flex-shrink-0"
          aria-label="Inicio"
        >
          <span className="inline-flex items-center justify-center w-6 h-6 sm:w-8 sm:h-8 rounded-lg sm:rounded-xl bg-gradient-to-br from-indigo-500 via-violet-500 to-pink-500 text-white shadow-sm">
            <CoffeeIcon className="w-3.5 h-3.5 sm:w-[18px] sm:h-[18px]" />
          </span>
          <span
            className={`text-sm sm:text-lg font-extrabold tracking-tight truncate ${
              isLight ? "text-slate-900 group-hover:text-slate-700" : "text-slate-100 group-hover:text-white"
            }`}
          >
            late.kodingvibes.com
          </span>
        </Link>

        {/* Desktop nav */}
        <div className="hidden sm:flex items-center gap-1 sm:gap-2">
          <Link
            to="/icecast"
            aria-label="Radio"
            title="Radio"
            className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-sm transition-colors ${
              isRadio ? activeLink : baseLink
            }`}
          >
            <Radio className="w-4 h-4" />
            <span>Radio</span>
          </Link>

          <Link
            to="/irc"
            aria-label="Chat"
            title="Chat"
            className={`relative flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-sm transition-colors ${
              isChat ? activeLink : baseLink
            }`}
          >
            <MessageCircle className="w-4 h-4" />
            <span>Chat</span>
            <span
              className={`ml-1 text-[10px] tabular-nums font-semibold px-1.5 py-0.5 rounded-full ${
                isChat
                  ? "bg-accent/30 text-accent"
                  : isLight
                  ? "bg-slate-200 text-slate-700"
                  : "bg-slate-800 text-slate-200"
              } ${onlineCount === null ? "opacity-50" : ""}`}
              title={onlineCount === null ? "sin conexión" : `${onlineCount} en línea`}
            >
              {onlineCount ?? "—"}
            </span>
          </Link>

          <Link
            to="/games"
            aria-label="Juegos"
            title="Juegos"
            className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-sm transition-colors ${
              isGames ? activeLink : baseLink
            }`}
          >
            <Gamepad2 className="w-4 h-4" />
            <span>Juegos</span>
          </Link>

          <UserMenu />
        </div>

        {/* Mobile: hamburger + UserMenu */}
        <div className="flex sm:hidden items-center gap-1">
          <UserMenu />
          <div ref={hamburgerRef} className="relative">
            <button
              onClick={() => setHamburgerOpen(!hamburgerOpen)}
              aria-label="Menú"
              className={`flex items-center justify-center w-8 h-8 rounded-lg transition-colors ${
                hamburgerOpen || isRadio || isChat || isGames || isApps ? activeLink : baseLink
              }`}
            >
              {hamburgerOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
            </button>
            {hamburgerOpen && (
              <div
                className={`absolute right-0 mt-1 w-48 rounded-xl border shadow-lg backdrop-blur ${
                  isLight
                    ? "bg-white/95 border-slate-200"
                    : "bg-slate-900/95 border-slate-700"
                }`}
              >
                <Link
                  to="/icecast"
                  onClick={() => setHamburgerOpen(false)}
                  className={`flex items-center gap-2 px-3 py-2 text-sm rounded-t-xl transition-colors ${
                    isLight ? "hover:bg-slate-100" : "hover:bg-slate-800"
                  } ${isRadio ? "text-accent" : ""}`}
                >
                  <Radio className="w-4 h-4" />
                  Radio
                </Link>
                <Link
                  to="/irc"
                  onClick={() => setHamburgerOpen(false)}
                  className={`flex items-center gap-2 px-3 py-2 text-sm transition-colors ${
                    isLight ? "hover:bg-slate-100" : "hover:bg-slate-800"
                  } ${isChat ? "text-accent" : ""}`}
                >
                  <MessageCircle className="w-4 h-4" />
                  Chat
                  <span
                    className={`ml-auto text-[10px] tabular-nums font-semibold px-1.5 py-0.5 rounded-full ${
                      isLight ? "bg-slate-200 text-slate-700" : "bg-slate-800 text-slate-200"
                    } ${onlineCount === null ? "opacity-50" : ""}`}
                  >
                    {onlineCount ?? "—"}
                  </span>
                </Link>
                <Link
                  to="/games"
                  onClick={() => setHamburgerOpen(false)}
                  className={`flex items-center gap-2 px-3 py-2 text-sm transition-colors ${
                    isLight ? "hover:bg-slate-100" : "hover:bg-slate-800"
                  } ${isGames ? "text-accent" : ""}`}
                >
                  <Gamepad2 className="w-4 h-4" />
                  Juegos
                </Link>
                <div className={`border-t ${isLight ? "border-slate-200" : "border-slate-700"}`} />
                <Link
                  to="/profiles"
                  onClick={() => setHamburgerOpen(false)}
                  className={`flex items-center gap-2 px-3 py-2 text-sm transition-colors ${
                    isLight ? "hover:bg-slate-100" : "hover:bg-slate-800"
                  } ${loc.pathname === "/profiles" ? "text-accent" : ""}`}
                >
                  <UserCircle className="w-4 h-4" />
                  Perfiles
                </Link>
                <Link
                  to="/freelance"
                  onClick={() => setHamburgerOpen(false)}
                  className={`flex items-center gap-2 px-3 py-2 text-sm transition-colors ${
                    isLight ? "hover:bg-slate-100" : "hover:bg-slate-800"
                  } ${loc.pathname === "/freelance" ? "text-accent" : ""}`}
                >
                  <Briefcase className="w-4 h-4" />
                  Freelance
                </Link>
                <Link
                  to="/forum"
                  onClick={() => setHamburgerOpen(false)}
                  className={`flex items-center gap-2 px-3 py-2 text-sm transition-colors ${
                    isLight ? "hover:bg-slate-100" : "hover:bg-slate-800"
                  } ${loc.pathname === "/forum" ? "text-accent" : ""}`}
                >
                  <MessageSquareQuote className="w-4 h-4" />
                  Foro
                </Link>
                <Link
                  to="/trivia"
                  onClick={() => setHamburgerOpen(false)}
                  className={`flex items-center gap-2 px-3 py-2 text-sm rounded-b-xl transition-colors ${
                    isLight ? "hover:bg-slate-100" : "hover:bg-slate-800"
                  } ${loc.pathname === "/trivia" ? "text-accent" : ""}`}
                >
                  <Sparkles className="w-4 h-4" />
                  Trivias
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
