import { RequireAuth } from "@/components/RequireAuth";

// The shell renders this empty div on /icecast; the
// late-micro-radio bundle auto-mounts its React tree into it.
// The auth gate is shared across all gated routes via
// <RequireAuth> in App.tsx.
export function Icecast() {
  return (
    <RequireAuth mountSlot={<div id="micro-radio-root" />}>
      <div id="micro-radio-root" className="w-full h-full" />
    </RequireAuth>
  );
}
