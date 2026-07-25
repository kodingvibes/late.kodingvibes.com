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

declare global {
  interface Window {
    LateSession?: LateSessionAPI;
    DashboardEngine?: { version: string };
    ChatEngine?: ChatEngineAPI;
    __lateMicroDashboardMount?: () => void;
  }
}

export {};
