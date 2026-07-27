import { RequireAuth } from "@/components/RequireAuth";

export function Mad8() {
  return (
    <RequireAuth mountSlot={<div id="micro-mad8-root" />}>
      <div id="micro-mad8-root" className="w-full h-full" />
    </RequireAuth>
  );
}
