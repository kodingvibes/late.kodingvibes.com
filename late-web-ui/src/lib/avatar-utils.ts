// ponytail: the shell used to be a fully dark palette, but we
// now support light mode + accent themes. The deterministic nick
// colour needs to be readable against either background.

const NICK_PALETTE_DARK = [
  "#f472b6",
  "#fbbf24",
  "#34d399",
  "#22d3ee",
  "#a78bfa",
  "#fb7185",
  "#c084fc",
  "#60a5fa",
  "#facc15",
  "#4ade80",
  "#f97316",
  "#e879f9",
];

const NICK_PALETTE_LIGHT = [
  "#db2777",
  "#d97706",
  "#059669",
  "#0891b2",
  "#7c3aed",
  "#e11d48",
  "#a21caf",
  "#2563eb",
  "#ca8a04",
  "#16a34a",
  "#ea580c",
  "#c026d3",
];

function hashNick(nick: string): number {
  let h = 0;
  for (let i = 0; i < nick.length; i++) {
    h = (h * 31 + nick.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

export function getNickColor(nick: string, mode: "light" | "dark" = "dark"): string {
  const palette = mode === "light" ? NICK_PALETTE_LIGHT : NICK_PALETTE_DARK;
  return palette[hashNick(nick) % palette.length];
}
