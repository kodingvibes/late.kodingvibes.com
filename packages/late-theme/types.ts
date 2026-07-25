export type ThemeMode = "light" | "dark";

export type AccentName =
  | "indigo"
  | "violet"
  | "emerald"
  | "rose"
  | "amber"
  | "cyan";

export interface AccentVars {
  primary: string;
  primaryLight: string;
  soft: string;
  softLight: string;
  ring: string;
  ringLight: string;
  glowA: string;
  glowB: string;
  glowALight: string;
  glowBLight: string;
}

export interface LateTheme {
  mode: ThemeMode;
  accent: AccentName;
  accentPrimary: string;
  accentSoft: string;
  accentRing: string;
  accentGlowA: string;
  accentGlowB: string;
  accentGlowALight: string;
  accentGlowBLight: string;
}
