import { useEffect, useState, ReactNode } from "react";
import { AppLoader } from "@/components/AppLoader";
import {
  clearSession,
  exchangeToken,
  getSavedSession,
  installLateSession,
  redirectToSso,
  saveSession,
  validateSession,
} from "@/lib/chat-session";

type Phase = "loading" | "ready" | "login" | "error";

interface RequireAuthProps {
  children: ReactNode;
  // ponytail: the gate renders an empty <div id="micro-*-root">
  // before validating the session, so the micro can race-mount
  // and the auth check happens in parallel. If you want the
  // micro to wait for the session (e.g. so it can read
  // window.LateSession.user at mount), pass mountSlot; the
  // gate will still validate first.
  mountSlot?: ReactNode;
}

/**
 * Auth gate for any route that requires a valid session.
 *
 * On first render it:
 * 1. Installs window.LateSession (the micro frontends read it).
 * 2. Handles ?token= / ?logout=1 like the chat page did.
 * 3. Validates the saved session against /api/auth/me.
 *
 * Renders children + mountSlot only when the session is valid.
 * Otherwise shows the same login screen used by /irc.
 */
export function RequireAuth({ children, mountSlot }: RequireAuthProps) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    installLateSession();

    const params = new URLSearchParams(window.location.search);
    const token = params.get("token");
    const logout = params.get("logout") === "1";
    // ponytail: ?next=/path is the post-login destination.
    // We only honor same-origin paths to avoid open-redirect
    // attacks where a phishing page could bounce the user
    // through SSO and then to evil.com.
    const next = sanitizeNext(params.get("next"));

    if (token) {
      window.history.replaceState({}, "", window.location.pathname);
      exchangeToken(token)
        .then((session) => {
          saveSession(session);
          if (next) {
            window.location.href = next;
            return;
          }
          setPhase("ready");
        })
        .catch((e) => {
          setError(e.message || "El enlace de sesión expiró o es inválido.");
          setPhase("login");
        });
      return;
    }

    if (logout) {
      clearSession();
      window.history.replaceState({}, "", window.location.pathname);
      window.location.reload();
      return;
    }

    const saved = getSavedSession();
    if (!saved) {
      setPhase("login");
      return;
    }

    validateSession()
      .then(() => {
        if (next) {
          // Already authenticated, jump straight to the next
          // page. The path is intentionally not stripped from
          // the URL — the target page handles the query
          // (or ignores it).
          window.location.href = next;
          return;
        }
        setPhase("ready");
      })
      .catch(() => {
        clearSession();
        setPhase("login");
      });
  }, []);

  if (phase === "loading") {
    return (
      <>
        {mountSlot}
        <AppLoader label="cargando…" />
      </>
    );
  }

  if (phase === "login") {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center px-4 animate-menu-backdrop">
        <div className="flex flex-col items-center gap-4 max-w-md text-center animate-menu-pop">
          <div className="text-slate-200 text-sm font-medium">
            {error || "Necesitás iniciar sesión para entrar."}
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <button
              onClick={redirectToSso}
              className="px-4 py-2 rounded-lg bg-accent hover:bg-accent-soft text-white text-sm font-medium transition"
            >
              Iniciar sesión con kodingvibes
            </button>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

/**
 * Accept only same-origin paths starting with "/". Anything
 * else (absolute URL, protocol-relative, javascript:, etc.)
 * returns null so the caller can ignore it.
 */
function sanitizeNext(raw: string | null): string | null {
  if (!raw) return null;
  // Decode in case the SSO bridge sent an encoded URL.
  let v: string;
  try { v = decodeURIComponent(raw); } catch { return null; }
  if (!v.startsWith("/")) return null;
  if (v.startsWith("//")) return null;
  return v;
}
