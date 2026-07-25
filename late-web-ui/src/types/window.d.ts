import type { LateUser } from "./lib/chat-session";

export interface LateSessionAPI {
  readonly sessionId: string | null;
  readonly user: LateUser | null;
  readonly ssoUrl: string;
  api<T>(path: string, init?: RequestInit): Promise<T>;
  logout(): void;
  redirectToSso(): void;
  onAuthFatal(handler: () => void): () => void;
  clearSsoBudget?(): void;
}

declare global {
  interface Window {
    LateSession?: LateSessionAPI;
  }
}

export {};
