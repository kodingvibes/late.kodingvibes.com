import { RequireAuth } from "@/components/RequireAuth";

export function Dashboard() {
  return (
    <RequireAuth mountSlot={<div id="micro-dashboard-root" />}>
      <div id="micro-dashboard-root" className="w-full h-full" />
    </RequireAuth>
  );
}
