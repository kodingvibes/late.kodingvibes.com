import { useSyncExternalStore } from "react";
import type { RadioEngine, RadioState, StreamInfo } from "@/lib/radio-engine-types";

declare global {
  interface Window {
    RadioEngine?: RadioEngine;
  }
}

// Static fallback used by the Home page (and by MiniPlayer's "prev/next" if
// the micro hasn't loaded yet). Kept in sync with late-micro-radio's
// STREAMS list (v0.0.0). The shell still works without the micro; once
// the micro loads it replaces the engine and these fallback streams are
// ignored.
export const FALLBACK_STREAMS: readonly StreamInfo[] = [
  { name: "groovesalad",   mount: "groovesalad",   url: "/groovesalad",   category: "Groove Salad",         emoji: "\u263E", accent: "text-cyan-400" },
  { name: "dronezone",     mount: "dronezone",     url: "/dronezone",     category: "Drone Zone",           emoji: "\u266A", accent: "text-amber-400" },
  { name: "fluid",         mount: "fluid",         url: "/fluid",         category: "Fluid",                emoji: "\u25D0", accent: "text-purple-400" },
  { name: "indiepop",      mount: "indiepop",      url: "/indiepop",      category: "Indie Pop",            emoji: "\u2665", accent: "text-pink-400" },
  { name: "u80s",          mount: "u80s",          url: "/u80s",          category: "Underground 80s",      emoji: "\u266B", accent: "text-orange-400" },
  { name: "vaporwaves",    mount: "vaporwaves",    url: "/vaporwaves",    category: "Vaporwaves",           emoji: "\u25E2", accent: "text-fuchsia-400" },
  { name: "metal",         mount: "metal",         url: "/metal",         category: "Metal",                emoji: "\u266C", accent: "text-rose-400" },
  { name: "dubstep",       mount: "dubstep",       url: "/dubstep",       category: "Dub Step",             emoji: "\u25E4", accent: "text-lime-400" },
  { name: "7soul",         mount: "7soul",         url: "/7soul",         category: "7 Soul",               emoji: "\u266F", accent: "text-indigo-400" },
  { name: "beatblender",   mount: "beatblender",   url: "/beatblender",   category: "Beat Blender",         emoji: "\u25CD", accent: "text-teal-400" },
  { name: "bootliquor",    mount: "bootliquor",    url: "/bootliquor",    category: "Boot Liquor",          emoji: "\u26F0", accent: "text-amber-600" },
  { name: "doomed",        mount: "doomed",        url: "/doomed",        category: "Doomed",               emoji: "\u2020", accent: "text-red-400" },
  { name: "illstreet",     mount: "illstreet",     url: "/illstreet",     category: "Illinois Street Lounge", emoji: "\u231B", accent: "text-yellow-400" },
  { name: "lush",          mount: "lush",          url: "/lush",          category: "Lush",                 emoji: "\u2740", accent: "text-pink-300" },
  { name: "poptron",       mount: "poptron",       url: "/poptron",       category: "PopTron",              emoji: "\u25CE", accent: "text-sky-400" },
  { name: "secretagent",   mount: "secretagent",   url: "/secretagent",   category: "Secret Agent",         emoji: "\u2302", accent: "text-slate-300" },
  { name: "suburbsofgoa",  mount: "suburbsofgoa",  url: "/suburbsofgoa",  category: "Suburbs of Goa",       emoji: "\u25C8", accent: "text-emerald-400" },
  { name: "thetrip",       mount: "thetrip",       url: "/thetrip",       category: "The Trip",             emoji: "\u27D0", accent: "text-violet-400" },
];

const FALLBACK_STATE: RadioState = {
  current: null,
  track: null,
  playing: false,
  loading: false,
  volume: 0.7,
  muted: false,
};

export function getEngine(): RadioEngine | null {
  return typeof window !== "undefined" ? window.RadioEngine ?? null : null;
}

export function getRadioState(): RadioState {
  return getEngine()?.getState() ?? FALLBACK_STATE;
}

export function subscribeRadio(fn: () => void): () => void {
  const e = getEngine();
  if (e) return e.subscribe(fn);
  let unsub: (() => void) | null = null;
  const id = setInterval(() => {
    const engine = getEngine();
    if (engine) {
      clearInterval(id);
      unsub = engine.subscribe(fn);
      fn();
    }
  }, 100);
  return () => {
    clearInterval(id);
    unsub?.();
  };
}

export function useRadioState(): RadioState {
  return useSyncExternalStore(subscribeRadio, getRadioState, getRadioState);
}

export function useRadioEngine(): RadioEngine {
  const e = getEngine();
  if (!e) {
    throw new Error(
      "RadioEngine not available. late-micro-radio hasn't loaded yet.",
    );
  }
  return e;
}

export function useRadioStreams(): readonly StreamInfo[] {
  const e = getEngine();
  return e?.streams ?? FALLBACK_STREAMS;
}
