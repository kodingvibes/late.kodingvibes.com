// ponytail: this file is a `.d.ts` ambient module. It declares
// the global window typing and re-exports `LateUser` for callers
// that want to type a `user` field directly. The real definition
// of LateUser lives in `lib/chat-session.ts` so runtime code and
// types stay in sync.
export type { LateUser } from "@/lib/chat-session";

export interface LateSessionAPI {
  readonly sessionId: string | null;
  readonly user: LateUser | null;
  readonly ssoUrl: string;
  api<T>(path: string, init?: RequestInit): Promise<T>;
  updateProfile(patch: {
    display_name?: string;
    name?: string;
    avatar_url?: string | null;
    preferences?: Record<string, unknown>;
  }): Promise<LateUser>;
  logout(): void;
  redirectToSso(): void;
  onAuthFatal(handler: () => void): () => void;
  clearSsoBudget?(): void;
}

export interface ChatEngineAPI {
  readonly version: string;
  /** Latest count of users online across every channel the MF
   *  loaded. The header polls this for the chat badge. The MF
   *  publishes updates whenever the set of active user_ids
   *  changes (presence online/offline events). */
  onlineCount?: number;
  /** Open the nick-change modal. The header wires the user menu
   *  to this; if the MF hasn't mounted yet the call is a no-op. */
  openNickModal?: () => void;
  /** Open the notification settings modal. Mirrors `openNickModal`. */
  openNotificationSettings?: () => void;
}

/** ponytail: a small read-only theme snapshot the shell
 *  publishes on window so the micro-fronts can pick up the
 *  same light/dark mode + accent without having to ship
 *  their own ThemeProvider. Updated whenever the user picks
 *  a new combo in the theme switcher. The shell also fires
 *  a `late:theme-change` CustomEvent on `window` so the MFs
 *  can react synchronously without polling. */
export type ThemeMode = "light" | "dark";
export type AccentName =
  | "indigo"
  | "violet"
  | "emerald"
  | "rose"
  | "amber"
  | "cyan";
export interface LateTheme {
  mode: ThemeMode;
  accent: AccentName;
  accentPrimary: string;
  accentSoft: string;
  accentRing: string;
  /** ponytail: pre-baked rgba tones for the page-level halo.
   *  Two pairs: dark + light, so the chosen accent actually
   *  tints the body backdrop. The CSS reads them via
   *  var(--accent-glow-a) so the minifier can't collapse
   *  the color-mix back to 0% opacity inside a gradient
   *  stop. */
  accentGlowA: string;
  accentGlowB: string;
  accentGlowALight: string;
  accentGlowBLight: string;
}

declare global {
  interface Window {
    LateSession?: LateSessionAPI;
    LateTheme?: LateTheme;
    DashboardEngine?: { version: string };
    ChatEngine?: ChatEngineAPI;
    __lateMicroDashboardMount?: () => void;
  }
}

export {};
