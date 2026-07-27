import { Link, useLocation } from "react-router-dom";
import { Radio, MessageCircle, Gamepad2, Menu, X } from "lucide-react";
import { useEffect, useState, useRef, type ReactNode } from "react";
import { CoffeeIcon } from "./AppLoader";
import { UserMenu } from "./UserMenu";
import { useTheme } from "@/providers/theme-provider";

interface ChatNavLinkProps {
  isActive: boolean;
  baseClass: string;
  activeClass: string;
  onClick?: () => void;
  children?: ReactNode;
}

function ChatNavLink({ isActive, baseClass, activeClass, onClick, children }: ChatNavLinkProps) {
  return (
    <Link
      to="/irc"
      aria-label="Chat"
      title="Chat"
      onClick={onClick}
      className={`relative flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-sm transition-colors ${
        isActive ? activeClass : baseClass
      } ${children ? "justify-between" : ""}`}
    >
      {children ?? (
        <>
          <MessageCircle className="w-4 h-4" />
          <span>Chat</span>
        </>
      )}
    </Link>
  );
}

export default function SiteHeader() {
  const loc = useLocation();
  const { mode } = useTheme();
  const isLight = mode === "light";
  const [hamburgerOpen, setHamburgerOpen] = useState(false);
  const hamburgerRef = useRef<HTMLDivElement>(null);

  const isChat = loc.pathname.startsWith("/irc");
  const isRadio = loc.pathname.startsWith("/icecast");
  const isGames = loc.pathname.startsWith("/games");

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
    ? "text-slate-500 hover:text-slate-900 hover:bg-surface-tint-60"
    : "text-slate-400 hover:text-slate-100 hover:bg-accent/15";
  const activeLink =
    "bg-accent/15 text-accent  shadow-accent";

  return (
    <header
      className={`sticky top-0 z-40 backdrop-blur  ${
        isLight
          ? "bg-white/70 "
          : "bg-surface-3 "
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

        {/* Desktop nav links — hidden on mobile (the hamburger below
         * exposes the same destinations in a drawer).
         *
         * ponytail: `hidden sm:flex` is broken under this Tailwind v4 build
         * because the `.hidden` utility lands after `.sm\:flex` in the
         * `@layer utilities` cascade and wins on equal specificity, so
         * the desktop nav stays hidden on >=640px viewports. Using
         * `block sm:flex` alone still leaves the children visible in
         * mobile (block lays them out in a column). Custom CSS in
         * tokens.css forces the right display with media-query
         * specificity so neither utility wins. */}
        <div className="late-desktop-nav items-center gap-1 sm:gap-2">
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

          <ChatNavLink
            isActive={isChat}
            baseClass={baseLink}
            activeClass={activeLink}
          />

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
        </div>

        {/* Right cluster — UserMenu is mounted exactly once for the
         * whole viewport. On mobile the nickname truncates and the
         * dropdown still opens. The hamburger sits next to it as a
         * navigation shortcut; it does NOT carry a UserMenu entry of
         * its own. */}
        <div className="flex items-center gap-1">
          <UserMenu />
          <div ref={hamburgerRef} className="relative sm:hidden">
            <button
              onClick={() => setHamburgerOpen(!hamburgerOpen)}
              aria-label="Menú"
              className={`flex items-center justify-center w-8 h-8 rounded-lg transition-colors ${
                hamburgerOpen || isRadio || isChat || isGames ? activeLink : baseLink
              }`}
            >
              {hamburgerOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
            </button>
            {hamburgerOpen && (
              <div
                className={`absolute right-0 mt-1 w-48 rounded-xl shadow-lg backdrop-blur ${
                  isLight
                    ? "bg-white/95 "
                    : "bg-slate-900/95 "
                }`}
              >
                <Link
                  to="/icecast"
                  onClick={() => setHamburgerOpen(false)}
                  className={`flex items-center gap-2 px-3 py-2 text-sm rounded-t-xl transition-colors ${
                    isLight ? "hover:bg-accent/15" : "hover:bg-accent/15"
                  } ${isRadio ? "text-accent" : ""}`}
                >
                  <Radio className="w-4 h-4" />
                  Radio
                </Link>
                <ChatNavLink
                  isActive={isChat}
                  baseClass={`flex items-center gap-2 px-3 py-2 text-sm transition-colors ${
                    isLight ? "hover:bg-accent/15" : "hover:bg-accent/15"
                  }`}
                  activeClass={`flex items-center gap-2 px-3 py-2 text-sm transition-colors text-accent ${
                    isLight ? "hover:bg-accent/15" : "hover:bg-accent/15"
                  }`}
                  onClick={() => setHamburgerOpen(false)}
                >
                  <MessageCircle className="w-4 h-4" />
                  Chat
                </ChatNavLink>
                <Link
                  to="/games"
                  onClick={() => setHamburgerOpen(false)}
                  className={`flex items-center gap-2 px-3 py-2 text-sm rounded-b-xl transition-colors ${
                    isLight ? "hover:bg-accent/15" : "hover:bg-accent/15"
                  } ${isGames ? "text-accent" : ""}`}
                >
                  <Gamepad2 className="w-4 h-4" />
                  Juegos
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
