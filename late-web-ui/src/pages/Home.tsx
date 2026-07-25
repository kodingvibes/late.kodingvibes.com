import { Link } from "react-router-dom";
import { Radio, MessageCircle } from "lucide-react";
import { FALLBACK_STREAMS } from "@/lib/radio-engine";
import type { StreamInfo } from "@/lib/radio-engine-types";
import useDocumentTitle from "@/lib/use-document-title";
import { useTheme } from "@/providers/theme-provider";

const FEATURED = ["groovesalad", "dronezone", "fluid", "indiepop", "vaporwaves", "dubstep"] as const;

// ponytail: Home used to subscribe to window.RadioEngine via
// useSyncExternalStore, but with audio playing + the <audio> element
// streaming, the re-render churn (every emit from setTrack every 5s)
// was enough to crash Chromium when navigating between routes. We now
// show static content and let the user click into /icecast to start
// playback. The MiniPlayer in the shell still reflects the engine state
// (it has its own subscription), so the UX is the same.
export function Home() {
  useDocumentTitle();
  const { mode } = useTheme();
  const isLight = mode === "light";
  const engineStreams: readonly StreamInfo[] =
    typeof window !== "undefined" && window.RadioEngine ? window.RadioEngine.streams : FALLBACK_STREAMS;
  const featured = FEATURED
    .map((mount) => engineStreams.find((s) => s.mount === mount))
    .filter((s): s is StreamInfo => Boolean(s));

  return (
    <div className={`relative min-h-screen ${isLight ? "text-slate-900" : "text-slate-100"} pb-24`}>
      {/* ponytail: a faint accent halo behind the page title so
       * the chosen colour bleeds into the surface without
       * hijacking the whole backdrop. The radial gradient
       * picks up the live --accent-primary from the theme
       * provider, so picking rose / emerald / amber actually
       * tints the page. */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-[480px] -z-10 bg-accent-glow"
        aria-hidden="true"
      />
      <section className="max-w-5xl mx-auto px-4 sm:px-6 pt-10 sm:pt-16 pb-8 sm:pb-12">
        <h1 className="text-3xl sm:text-5xl font-bold tracking-tight mb-3">
          un rinconcito comfy, tarde en la noche
        </h1>
        <p className={`text-base sm:text-lg max-w-2xl ${isLight ? "text-slate-600" : "text-slate-400"}`}>
          chat, radio y esquinas tranquilas para los que viven en una terminal.
          quédate un rato.
        </p>
      </section>

      <section className="max-w-5xl mx-auto px-4 sm:px-6 pb-12">
        <h2 className={`text-xs font-mono uppercase tracking-wider mb-3 ${isLight ? "text-slate-500" : "text-slate-500"}`}>
          # salas
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Link
            to="/irc"
            className={`group block rounded-2xl border p-5 transition-colors ${
              isLight
                ? "border-slate-300/60 bg-white/70 hover:border-accent/50 hover:bg-white/90"
                : "border-slate-700/60 bg-slate-900/40 hover:border-accent/50 hover:bg-slate-900/70"
            }`}
          >
            <div className="flex items-center gap-2 mb-2">
              <MessageCircle className="w-4 h-4 text-accent" />
              <span className={`font-mono text-sm ${isLight ? "text-slate-700" : "text-slate-300"}`}>#chat</span>
            </div>
            <p className={`font-semibold mb-1 ${isLight ? "text-slate-900" : "text-slate-200"}`}>chat</p>
            <p className={`text-sm ${isLight ? "text-slate-500" : "text-slate-500"}`}>
              el mismo chat de kodingvibes, con algunas salas extra.
            </p>
          </Link>

          <Link
            to="/icecast"
            className={`group block rounded-2xl border p-5 transition-colors ${
              isLight
                ? "border-slate-300/60 bg-white/70 hover:border-accent/50 hover:bg-white/90"
                : "border-slate-700/60 bg-slate-900/40 hover:border-accent/50 hover:bg-slate-900/70"
            }`}
          >
            <div className="flex items-center gap-2 mb-2">
              <Radio className="w-4 h-4 text-accent" />
              <span className={`font-mono text-sm ${isLight ? "text-slate-700" : "text-slate-300"}`}>#radio</span>
            </div>
            <p className={`font-semibold mb-1 ${isLight ? "text-slate-900" : "text-slate-200"}`}>streams 24/7</p>
            <p className={`text-sm ${isLight ? "text-slate-500" : "text-slate-500"}`}>
              groovesalad, dronezone, vaporwaves, dubstep y más.
            </p>
          </Link>
        </div>
      </section>

      <section className="max-w-5xl mx-auto px-4 sm:px-6 pb-12">
        <div className="flex items-center justify-between mb-3">
          <h2 className={`text-xs font-mono uppercase tracking-wider ${isLight ? "text-slate-500" : "text-slate-500"}`}>
            # destacadas
          </h2>
          <Link
            to="/icecast"
            className="text-xs text-accent hover:text-accent-soft transition-colors"
          >
            todas las emisoras →
          </Link>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {featured.map((s) => (
            <Link
              key={s.mount}
              to="/icecast"
              className={`group flex items-center gap-3 rounded-xl border p-3 text-left transition-all ${
              isLight
                ? "border-slate-300/60 bg-white/70 hover:border-accent/40 hover:bg-white/90"
                : "border-slate-700/60 bg-slate-900/40 hover:border-accent/40 hover:bg-slate-900/70"
              }`}
            >
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 text-lg bg-accent/20 ${s.accent || "text-accent"}`}>
                <Radio className="w-3.5 h-3.5 text-white" />
              </div>
              <div className="min-w-0 flex-1">
                <p className={`text-sm font-medium truncate ${isLight ? "text-slate-900" : "text-slate-100"}`}>{s.category || s.name}</p>
                <p className={`text-[10px] font-mono truncate ${isLight ? "text-slate-500" : "text-slate-500"}`}>/{s.mount}</p>
              </div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  )
}

export default Home;
