import { useEffect, useState } from "react";
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

export function Irc() {
  const [phase, setPhase] = useState<Phase>("loading");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    installLateSession();
    document.title = "chat · late.kodingvibes.com";

    const params = new URLSearchParams(window.location.search);
    const token = params.get("token");
    const logout = params.get("logout") === "1";

    if (token) {
      window.history.replaceState({}, "", "/irc");
      exchangeToken(token)
        .then((session) => {
          saveSession(session);
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
      window.history.replaceState({}, "", "/irc");
      window.location.reload();
      return;
    }

    const saved = getSavedSession();
    if (!saved) {
      setPhase("login");
      return;
    }

    validateSession()
      .then(() => setPhase("ready"))
      .catch(() => {
        clearSession();
        setPhase("login");
      });
  }, []);

  if (phase === "loading") return <AppLoader label="cargando chat…" />;

  if (phase === "login") {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center px-4">
        <div className="flex flex-col items-center gap-4 max-w-md text-center">
          <div className="text-slate-200 text-sm font-medium">
            {error || "Necesitás iniciar sesión para usar el chat."}
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <button
              onClick={redirectToSso}
              className="px-4 py-2 rounded-lg bg-indigo-500 hover:bg-indigo-400 text-white text-sm font-medium transition"
            >
              Iniciar sesión con kodingvibes
            </button>
          </div>
        </div>
      </div>
    );
  }

  return <div id="micro-chat-root" />;
}
