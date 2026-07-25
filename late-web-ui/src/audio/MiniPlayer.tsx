import { useEffect, useRef, useState, useCallback } from "react";
import { Play, Pause, Volume2, VolumeX, X, PictureInPicture2, SkipBack, SkipForward } from "lucide-react";
import { useRadioState, useRadioEngine, useRadioStreams } from "@/lib/radio-engine";
import { MarqueeLink } from "./miniplayer/MarqueeLink";
import { SpectrumCanvas } from "./miniplayer/SpectrumCanvas";

// ponytail: drag/pin/floating persistence is so small it doesn't deserve
// its own file. Inlined here; survives refreshes via localStorage.
const POS_KEY       = "late.miniplayer.pos";
const COLLAPSED_KEY = "late.miniplayer.collapsed";
const FLOATING_KEY  = "late.miniplayer.floating";
const EXPANDED_W    = 360;
const COLLAPSED_W   = 132;
const DEFAULT_H     = 56;

function loadPos(): { x: number; y: number } | null {
  try {
    const raw = localStorage.getItem(POS_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as { x: number; y: number };
    if (typeof p.x === "number" && typeof p.y === "number") return p;
  } catch { /* ignore */ }
  return null;
}
function savePos(p: { x: number; y: number }) {
  try { localStorage.setItem(POS_KEY, JSON.stringify(p)); } catch { /* ignore */ }
}
function loadCollapsed(): boolean  { try { return localStorage.getItem(COLLAPSED_KEY) === "1"; } catch { return false; } }
function saveCollapsed(v: boolean) { try { localStorage.setItem(COLLAPSED_KEY, v ? "1" : "0"); } catch { /* ignore */ } }
function loadFloating(): boolean   { try { return localStorage.getItem(FLOATING_KEY) === "1"; } catch { return false; } }
function saveFloating(v: boolean)  { try { localStorage.setItem(FLOATING_KEY, v ? "1" : "0"); } catch { /* ignore */ } }

function defaultPos(): { x: number; y: number } {
  if (typeof window === "undefined") return { x: 16, y: 16 };
  return { x: Math.max(8, window.innerWidth - EXPANDED_W - 16), y: Math.max(8, window.innerHeight - DEFAULT_H - 16) };
}
function clampPos(p: { x: number; y: number }, w: number, h: number): { x: number; y: number } {
  if (typeof window === "undefined") return p;
  const maxX = Math.max(0, window.innerWidth - w);
  const maxY = Math.max(0, window.innerHeight - h);
  return { x: Math.min(Math.max(0, p.x), maxX), y: Math.min(Math.max(0, p.y), maxY) };
}

export default function MiniPlayer() {
  // ponytail: this component lives in the shell (outside the router) so the
  // user sees it on every route. It only READS window.RadioEngine — the
  // micro radio is the sole owner of the <audio> element and AudioContext.
  const state = useRadioState();
  // Capture the engine in a ref so it never changes identity for the
  // lifetime of this component. The useRadioEngine() hook can throw
  // if the micro hasn't loaded yet, and the engine reference itself is
  // a stable singleton on window — passing it as a dep to useEffect
  // would cause spurious re-runs only if window.RadioEngine swapped at
  // runtime, which it never does in production.
  const engineRef = useRef<ReturnType<typeof useRadioEngine> | null>(null);
  if (engineRef.current === null) {
    engineRef.current = useRadioEngine();
  }
  const engine = engineRef.current;
  const streams = useRadioStreams();

  // Drag position (desktop only) — top-left corner of the card in viewport space.
  // Always starts with a default position so the player is visible
  // before the first user interaction.
  const [pos, setPos] = useState<{ x: number; y: number }>(() => loadPos() ?? defaultPos());
  const [collapsed, setCollapsed] = useState<boolean>(() => loadCollapsed());
  const [floating, setFloating] = useState<boolean>(() => loadFloating());
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number; moved: boolean } | null>(null);
  const [isDesktop, setIsDesktop] = useState<boolean>(() =>
    typeof window !== "undefined" && window.innerWidth >= 640,
  );

  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);

  useEffect(() => { savePos(pos) }, [pos]);
  useEffect(() => { saveCollapsed(collapsed) }, [collapsed]);
  useEffect(() => { saveFloating(floating) }, [floating]);

  useEffect(() => {
    const onResize = () => setIsDesktop(window.innerWidth >= 640);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // ponytail: state (not ref) so the SpectrumCanvas re-renders when
  // the analyser becomes available. We only fetch the analyser ONCE
  // (on mount); subsequent re-renders don't need to re-poll.
  useEffect(() => {
    let cancelled = false;
    const tryAttach = () => {
      if (cancelled) return true;
      const el = engine.getAudioElement();
      const a = engine.getAnalyser();
      if (!el || !a) return false;
      setAnalyser(a);
      return true;
    };
    if (!tryAttach()) {
      const t = setInterval(() => {
        if (tryAttach()) clearInterval(t);
      }, 200);
      return () => {
        cancelled = true;
        clearInterval(t);
      };
    }
  }, [engine]);

  const isFloating = isDesktop && floating;
  useEffect(() => {
    if (!isFloating) return;
    setPos(p => clampPos(p, collapsed ? COLLAPSED_W : EXPANDED_W, DEFAULT_H));
  }, [isFloating, collapsed]);

  const onGripPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const card = (e.currentTarget as HTMLElement).parentElement as HTMLElement;
    const r = card.getBoundingClientRect();
    const cur = { x: r.left, y: r.top };
    setPos(cur);
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      origX: cur.x,
      origY: cur.y,
      moved: false,
    };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }, []);

  const onGripPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    if (!d.moved && Math.hypot(dx, dy) < 6) return;
    d.moved = true;
    const card = (e.currentTarget as HTMLElement).parentElement as HTMLElement | null;
    const cardW = card?.offsetWidth ?? (collapsed ? COLLAPSED_W : EXPANDED_W);
    const cardH = card?.offsetHeight ?? DEFAULT_H;
    setPos(clampPos({ x: d.origX + dx, y: d.origY + dy }, cardW, cardH));
  }, [collapsed]);

  const onGripPointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    dragRef.current = null;
    try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId) } catch { /* ignore */ }
  }, []);

  const onGripDoubleClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setCollapsed(c => !c);
  }, []);

  // ponytail: hooks must be declared unconditionally (no early returns before
  // them). Even when there's no current stream, prev/next should still be
  // callable (they fall back to the streams list).
  const goNext = useCallback(() => {
    if (streams.length === 0) return;
    const idx = Math.max(0, streams.findIndex(s => s.mount === state.current?.mount));
    const next = streams[(idx + 1) % streams.length];
    engine.play(next);
  }, [engine, streams, state.current?.mount]);
  const goPrev = useCallback(() => {
    if (streams.length === 0) return;
    const idx = streams.findIndex(s => s.mount === state.current?.mount);
    const prev = streams[(idx <= 0 ? streams.length : idx) - 1];
    engine.play(prev);
  }, [engine, streams, state.current?.mount]);

  if (!state.current) return null;

  const isPinned = !isDesktop || !floating;

  const positionStyle: React.CSSProperties = !isPinned
    ? { left: pos.x, top: pos.y, right: "auto", bottom: "auto" }
    : {};

  return (
    <div
      className={
        isPinned
          ? "fixed bottom-0 left-0 right-0 z-50 animate-slide-in-from-bottom"
          : "fixed z-50 transition-[width] duration-200 ease-out animate-scale-in"
      }
      style={{
        ...positionStyle,
        width: !isPinned ? (collapsed ? 132 : EXPANDED_W) : undefined,
      }}
    >
      <div
        className={
          isPinned
            ? "bg-slate-900/65 backdrop-blur border-t border-slate-700/60 shadow-2xl overflow-hidden flex"
            : "bg-slate-900/65 backdrop-blur border border-slate-700/60 rounded-2xl shadow-2xl overflow-hidden flex"
        }
      >
        {!isPinned && (
          <div
            onPointerDown={onGripPointerDown}
            onPointerMove={onGripPointerMove}
            onPointerUp={onGripPointerUp}
            onPointerCancel={onGripPointerUp}
            onDoubleClick={onGripDoubleClick}
            className="hidden sm:flex flex-col items-center justify-center gap-1 w-6 cursor-grab active:cursor-grabbing border-r border-slate-800/60 hover:bg-slate-800/40 transition-colors touch-none flex-shrink-0 select-none"
            aria-label="Arrastrar para mover · Doble clic para colapsar"
            title="Arrastra · Doble clic para colapsar"
            role="button"
          >
            <span className="flex flex-col items-center gap-[3px]">
              <span className="w-1 h-1 rounded-full bg-slate-500" />
              <span className="w-1 h-1 rounded-full bg-slate-500" />
              <span className="w-1 h-1 rounded-full bg-slate-500" />
            </span>
          </div>
        )}

        <div
          className={
            isPinned
              ? "flex items-center gap-1.5 px-2 py-2 min-w-0 flex-1"
              : `flex items-center gap-2 ${collapsed ? "pr-4" : ""} px-3 py-2 min-w-0 flex-1`
          }
        >
          {isPinned && (
            <>
              <div className="flex-1 min-w-0 flex items-center gap-2">
                <span className={`text-base leading-none flex-shrink-0 ${state.current.accent || "text-accent"}`}>
                  {state.current.emoji || "\u266A"}
                </span>
                <div className="min-w-0 flex flex-col leading-tight flex-1">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 truncate">
                    {state.current.category || state.current.name}
                  </span>
                  <MarqueeLink
                    to="/icecast"
                    text={state.track
                      ? [state.track.artist, state.track.title].filter(Boolean).join(" \u2014 ") || state.current.name
                      : (state.current.artist || state.current.title || state.current.name)}
                    className="text-sm font-medium text-slate-100"
                  />
                </div>
              </div>

              <SpectrumCanvas
                analyser={analyser}
                className="hidden sm:block flex-shrink-0 h-6 w-32 md:w-40"
                style={{ minWidth: 0 }}
              />

              <button
                onClick={engine.toggleMute}
                className="w-8 h-8 rounded-lg text-slate-300 hover:text-slate-100 hover:bg-slate-800 flex items-center justify-center flex-shrink-0 transition-colors"
                aria-label={state.muted ? "Activar sonido" : "Silenciar"}
                title={state.muted ? "Activar sonido" : "Silenciar"}
              >
                {state.muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
              </button>

              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={state.muted ? 0 : state.volume}
                onChange={(e) => engine.setVolume(Number(e.target.value))}
                className="w-16 sm:w-14 md:w-20 accent-accent flex-shrink-0"
                aria-label="Volumen"
              />

              <button
                onClick={goPrev}
                className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-200 flex items-center justify-center flex-shrink-0 transition-all hover:scale-105 active:scale-95 select-none"
                aria-label="Canal anterior"
                title="Canal anterior"
              >
                <SkipBack className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              </button>

              <button
                onClick={engine.toggle}
                className="w-10 h-10 rounded-full bg-accent hover:bg-accent-soft text-white flex items-center justify-center flex-shrink-0 transition-all hover:scale-105 active:scale-95 shadow-md hover:shadow-lg select-none"
                aria-label={state.playing ? "Pausar" : "Reproducir"}
              >
                {state.loading ? (
                  <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : state.playing ? (
                  <Pause className="w-4 h-4" />
                ) : (
                  <Play className="w-4 h-4 translate-x-[1px]" />
                )}
              </button>

              <button
                onClick={goNext}
                className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-200 flex items-center justify-center flex-shrink-0 transition-all hover:scale-105 active:scale-95 select-none"
                aria-label="Canal siguiente"
                title="Canal siguiente"
              >
                <SkipForward className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              </button>

              {isDesktop && (
                <button
                  onClick={() => setFloating(true)}
                  className="w-7 h-7 rounded-lg text-slate-500 hover:text-slate-100 hover:bg-slate-800 flex items-center justify-center flex-shrink-0 transition-colors"
                  aria-label="Desacoplar y mover"
                  title="Desacoplar · arrastrable"
                >
                  <PictureInPicture2 className="w-4 h-4" />
                </button>
              )}
            </>
          )}

          {!isPinned && (
            <>
              {!collapsed && (
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <span className={`text-base leading-none ${state.current.accent || "text-accent"}`}>
                    {state.current.emoji || "\u266A"}
                  </span>
                  <span className="text-xs font-semibold text-slate-300 truncate max-w-[6rem]">
                    {state.current.category || state.current.name}
                  </span>
                </div>
              )}

              {!collapsed && (
                <MarqueeLink
                  to="/icecast"
                  text={state.track
                    ? [state.track.artist, state.track.title].filter(Boolean).join(" \u2014 ") || state.current.name
                    : (state.current.artist || state.current.title || state.current.name)}
                  className="text-sm font-medium text-slate-100 max-w-[9rem]"
                />
              )}

              <SpectrumCanvas
                analyser={analyser}
                className="hidden sm:block flex-1 h-6 sm:h-7 min-w-0"
                style={{ minWidth: collapsed ? 48 : 0 }}
              />

              <button
                onClick={engine.toggle}
                className="w-9 h-9 rounded-full bg-accent hover:bg-accent-soft text-white flex items-center justify-center flex-shrink-0 transition-all hover:scale-105 active:scale-95 shadow-md select-none"
                aria-label={state.playing ? "Pausar" : "Reproducir"}
              >
                {state.loading ? (
                  <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : state.playing ? (
                  <Pause className="w-4 h-4" />
                ) : (
                  <Play className="w-4 h-4 translate-x-[1px]" />
                )}
              </button>

              {!collapsed && (
                <>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <span className={`w-2 h-2 rounded-full ${state.playing ? "bg-emerald-400" : "bg-slate-500"} ${state.playing ? "animate-pulse" : ""}`} />
                  </div>

                  <button
                    onClick={engine.toggleMute}
                    className="w-8 h-8 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 flex items-center justify-center flex-shrink-0 transition-colors hidden sm:flex"
                    aria-label={state.muted ? "Activar sonido" : "Silenciar"}
                  >
                    {state.muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                  </button>

                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={state.muted ? 0 : state.volume}
                    onChange={(e) => engine.setVolume(Number(e.target.value))}
                    className="w-12 sm:w-16 hidden sm:block accent-accent"
                    aria-label="Volumen"
                  />

                  <button
                    onClick={() => setFloating(false)}
                    className="w-7 h-7 rounded-lg text-slate-500 hover:text-slate-100 hover:bg-slate-800 flex items-center justify-center flex-shrink-0 transition-colors"
                    aria-label="Volver a fijar abajo"
                    title="Fijar abajo"
                  >
                    <PictureInPicture2 className="w-4 h-4" />
                  </button>

                  <button
                    onClick={engine.stop}
                    className="w-7 h-7 rounded-lg text-slate-500 hover:text-slate-100 hover:bg-slate-800 flex items-center justify-center flex-shrink-0 transition-colors"
                    aria-label="Detener"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
