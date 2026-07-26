export type { LateUser } from "@/lib/chat-session";
export type { ThemeMode, AccentName, LateTheme } from "@late/theme";

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
  onlineCount?: number;
  openNickModal?: () => void;
  openNotificationSettings?: () => void;
}

declare global {
  interface Window {
    LateSession?: LateSessionAPI;
    LateTheme?: LateTheme;
    DashboardEngine?: { version: string };
    ChatEngine?: ChatEngineAPI;
    ProfilesEngine?: { version: string };
    FreelanceEngine?: { version: string };
    GamesEngine?: { version: string };
    ForumEngine?: { version: string };
    TriviaEngine?: { version: string };
    __lateMicroDashboardMount?: () => void;
    __lateMicroProfilesMount?: () => void;
    __lateMicroFreelanceMount?: () => void;
    __lateMicroGamesMount?: () => void;
    __lateMicroForumMount?: () => void;
    __lateMicroTriviaMount?: () => void;
  }
}

export {};
