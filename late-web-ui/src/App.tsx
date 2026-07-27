import { lazy, Suspense, useEffect, useState } from "react";
import { BrowserRouter, Route, Routes, useLocation } from "react-router-dom";
import Home from "@/pages/Home";
import SiteHeader from "@/components/SiteHeader";
import MiniPlayer from "@/audio/MiniPlayer";
import { UpdateNotice } from "@/components/UpdateNotice";
import { AppLoader } from "@/components/AppLoader";
import { RequireAuth } from "@/components/RequireAuth";
import { ThemeProvider } from "@/providers/theme-provider";
import { Profile } from "@/pages/Profile";
import useViewportHeight from "@/lib/use-viewport-height";

// Each route renders a microfront slot. The actual UI lives in
// /micro/{radio,chat,dashboard}/latest/entry.js
const Icecast   = lazy(() => import("@/pages/Icecast").then((m) => ({ default: m.Icecast })));
const Irc       = lazy(() => import("@/pages/Irc").then((m) => ({ default: m.Irc })));
const Games     = lazy(() => import("@/pages/Games").then((m) => ({ default: m.Games })));
const Dashboard = lazy(() => import("@/pages/Dashboard").then((m) => ({ default: m.Dashboard })));

// ponytail: a micro might still be downloading on first navigation. The
// shell has no signal that the micro is "ready" beyond "did the React
// tree mount inside the slot?" — but the slot itself is just a div that
// the micro replaces wholesale. So we probe the window globals
// (window.RadioEngine / window.ChatEngine / window.DashboardEngine)
// and show the loader until the right one is present. The micro's
// entry.ts registers these on execution, so this fires as soon as the
// bundle parses.
function MicroLoader() {
  const loc = useLocation();
  const [ready, setReady] = useState(() => microReady(loc.pathname));
  useEffect(() => {
    setReady(microReady(loc.pathname));
    if (ready) return;
    const id = setInterval(() => {
      if (microReady(loc.pathname)) {
        setReady(true);
        clearInterval(id);
      }
    }, 80);
    return () => clearInterval(id);
  }, [loc.pathname, ready]);
  if (ready) return null;
  return <AppLoader label="cargando módulo…" fixed />;
}

function microReady(pathname: string): boolean {
  if (typeof window === "undefined") return false;
  if (pathname === "/icecast") return Boolean(window.RadioEngine);
  if (pathname === "/irc")
    return Boolean(
      (window as unknown as { ChatEngine?: unknown }).ChatEngine &&
        (window as unknown as { LateSession?: unknown }).LateSession,
    );
  if (pathname === "/games") return Boolean(window.GamesEngine);
  if (pathname === "/dashboard") return Boolean(window.DashboardEngine);
  return true;
}

export function App() {
  useViewportHeight();

  // Suppress the native browser context menu everywhere. Custom
  // menus (MessageContextMenu, UserContextMenu, ChannelContextMenu)
  // are responsible for opening their own UI on right-click — we
  // don't want the OS menu competing with them.
  useEffect(() => {
    const onContextMenu = (e: MouseEvent) => {
      e.preventDefault();
    };
    document.addEventListener("contextmenu", onContextMenu);
    return () => document.removeEventListener("contextmenu", onContextMenu);
  }, []);

  return (
    <ThemeProvider>
      <BrowserRouter>
        <div className="min-h-[calc(var(--vh,1vh)*100)] flex flex-col">
          <SiteHeader />
          <main className="flex-1 min-h-0 flex flex-col">
            <Suspense fallback={<AppLoader label="cargando ruta…" />}>
              <Routes>
                <Route path="/" element={<Home />} />
                <Route path="/icecast" element={<><Icecast /><MicroLoader /></>} />
                <Route path="/irc" element={<><Irc /><MicroLoader /></>} />
                <Route path="/games" element={<Games />} />
                <Route path="/dashboard" element={<RequireAuth><Dashboard /></RequireAuth>} />
                <Route path="/profile" element={<RequireAuth><Profile /></RequireAuth>} />
              </Routes>
            </Suspense>
          </main>
          {/* ponytail: MiniPlayer is global, outside the router. It subscribes
              to window.RadioEngine (provided by late-micro-radio). The micro
              also keeps the <audio> element alive across navigations. */}
          <MiniPlayer />
          <UpdateNotice />
        </div>
      </BrowserRouter>
    </ThemeProvider>
  );
}
