import { RequireAuth } from "@/components/RequireAuth";

// The shell renders this empty div on /irc; the late-micro-chat
// bundle auto-mounts its React tree into it. The auth gate is
// shared across all gated routes via <RequireAuth> in App.tsx.
export function Irc() {
  return (
    <RequireAuth mountSlot={<div id="micro-chat-root" />}>
      <div id="micro-chat-root" className="w-full h-full" />
    </RequireAuth>
  );
}
