// Chat session lives in the shell. The micro-chat bundle reads/writes
// only through window.LateSession (installed by Irc.tsx). It never
// touches localStorage for auth keys.
//
// Auth endpoints live in late-auth-service. The shell exchanges a JWT
// against /api/auth/exchange, validates the saved session with
// /api/auth/me, and the MF calls other services (chat, etc.) which
// themselves validate the same bearer token against late-auth.

const SESSION_KEY = "late.session";
const LEGACY_KEY = "chat.session";
const SSO_URL = "https://www.kodingvibes.com/api/sso/irc-token";
const SSO_REDIRECT_COUNT_KEY = "late.sso_redirects";
const MAX_SSO_REDIRECTS = 2;

export interface LateUser {
  id: number;
  email: string;
  name: string | null;
  display_name: string | null;
}

export interface LateSession {
  session_id: string;
  user: LateUser;
  expires_at?: number;
}

function readRaw(): string | null {
  return localStorage.getItem(SESSION_KEY) ?? localStorage.getItem(LEGACY_KEY);
}

export function getSavedSession(): LateSession | null {
  const raw = readRaw();
  if (!raw) return null;
  try {
    return JSON.parse(raw) as LateSession;
  } catch {
    localStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(LEGACY_KEY);
    return null;
  }
}

export function saveSession(s: LateSession) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(s));
  if (localStorage.getItem(LEGACY_KEY)) localStorage.removeItem(LEGACY_KEY);
}

export function clearSession() {
  localStorage.removeItem(SESSION_KEY);
  localStorage.removeItem(LEGACY_KEY);
}

export function clearSsoBudget() {
  sessionStorage.removeItem(SSO_REDIRECT_COUNT_KEY);
}

export function ssoBudgetExhausted(): boolean {
  return Number(sessionStorage.getItem(SSO_REDIRECT_COUNT_KEY) || "0") >= MAX_SSO_REDIRECTS;
}

export function redirectToSso() {
  const next = Number(sessionStorage.getItem(SSO_REDIRECT_COUNT_KEY) || "0") + 1;
  sessionStorage.setItem(SSO_REDIRECT_COUNT_KEY, String(next));
  clearSession();
  window.location.href = SSO_URL;
}

export async function exchangeToken(token: string): Promise<LateSession> {
  const res = await fetch("/api/auth/exchange", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token }),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}));
    throw new Error(detail.detail || `exchange failed: ${res.status}`);
  }
  return res.json();
}

export async function validateSession(): Promise<LateSession> {
  const me = await api<LateUser>("/api/auth/me");
  const cur = getSavedSession();
  if (!cur) throw new Error("no session");
  const next: LateSession = { ...cur, user: me };
  saveSession(next);
  return next;
}

export async function serverLogout(): Promise<void> {
  // ponytail: best-effort server-side invalidation. The shell still
  // clears localStorage and reloads even if the network call fails.
  try {
    await api<void>("/api/auth/logout", { method: "POST" });
  } catch {
    // ignore — local clear below is the user-facing source of truth
  }
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const session = getSavedSession();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(init.headers as Record<string, string> | undefined),
  };
  if (session?.session_id) headers.Authorization = `Bearer ${session.session_id}`;
  const res = await fetch(path, { ...init, headers });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}));
    if (res.status === 401) fireAuthFatal();
    throw new Error(detail.detail || `${path} failed: ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

const authFatalHandlers = new Set<() => void>();

export function onAuthFatal(handler: () => void): () => void {
  authFatalHandlers.add(handler);
  return () => {
    authFatalHandlers.delete(handler);
  };
}

export function fireAuthFatal() {
  for (const h of authFatalHandlers) h();
}

export function installLateSession() {
  if (typeof window === "undefined") return;
  (window as unknown as { LateSession?: unknown }).LateSession = {
    get sessionId() {
      return getSavedSession()?.session_id ?? null;
    },
    get user() {
      return getSavedSession()?.user ?? null;
    },
    ssoUrl: SSO_URL,
    api,
    logout: async () => {
      await serverLogout();
      clearSession();
      window.location.href = "/irc?logout=1";
    },
    redirectToSso,
    onAuthFatal,
    clearSsoBudget,
  };
}
