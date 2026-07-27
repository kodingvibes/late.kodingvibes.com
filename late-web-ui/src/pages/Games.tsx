import { RequireAuth } from "@/components/RequireAuth";

export function Games() {
  return (
    <RequireAuth mountSlot={<div id="micro-games-root" />}>
      <div id="micro-games-root" className="w-full h-full" />
    </RequireAuth>
  );
}
