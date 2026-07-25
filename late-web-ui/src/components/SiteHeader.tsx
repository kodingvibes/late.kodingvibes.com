import { Link, useLocation } from "react-router-dom";
import { Radio, MessageCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { CoffeeIcon } from "./AppLoader";
import { UserMenu } from "./UserMenu";
import { useTheme } from "@/providers/theme-provider";

export default function SiteHeader() {
  const loc = useLocation();
  const { mode } = useTheme();
  const isLight = mode === "light";
  const [onlineCount, setOnlineCount] = useState<number | null>(null);

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

  const baseLink = isLight
    ? "text-slate-500 hover:text-slate-900 hover:bg-slate-200"
    : "text-slate-400 hover:text-slate-100 hover:bg-slate-800";
  const activeLink =
    "bg-accent/15 text-accent ring-1 ring-accent/30 shadow-accent";

  return (
    <header
      className={`sticky top-0 z-40 backdrop-blur border-b ${
        isLight
          ? "bg-white/80 border-accent/20"
          : "bg-slate-950/80 border-accent/20"
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

        <div className="flex items-center gap-1 sm:gap-2">
          <Link
            to="/icecast"
            aria-label="Radio"
            title="Radio"
            className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-sm transition-colors ${
              isRadio ? activeLink : baseLink
            }`}
          >
            <Radio className="w-4 h-4" />
            <span className="hidden sm:inline">Radio</span>
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
            <span className="hidden sm:inline">Chat</span>
            {onlineCount !== null && onlineCount > 0 && (
              <span
                className={`ml-1 text-[10px] tabular-nums font-semibold px-1.5 py-0.5 rounded-full ${
                  isChat
                    ? isLight
                      ? "bg-accent/30 text-accent"
                      : "bg-accent/30 text-accent"
                    : isLight
                    ? "bg-slate-200 text-slate-700"
                    : "bg-slate-800 text-slate-200"
                }`}
                title={`${onlineCount} en línea`}
              >
                {onlineCount}
              </span>
            )}
          </Link>

          <UserMenu />
        </div>
      </div>
    </header>
  );
}
