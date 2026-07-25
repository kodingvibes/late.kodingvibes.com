// Microfront slot. The shell renders this empty div on
// /dashboard; the late-micro-dashboard bundle auto-mounts
// its React tree into it. The auth gate is shared across
// all gated routes via <RequireAuth> in App.tsx.
export function Dashboard() {
  return (
    <div className="min-h-screen">
      <div id="micro-dashboard-root" />
    </div>
  );
}