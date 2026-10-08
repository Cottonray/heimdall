import type { CSSProperties } from "react";
/** Local pointer feedback; does not alter captured device screenshots. */
export function TouchIndicator({
  x,
  y,
  active,
}: {
  x: number;
  y: number;
  active: boolean;
}) {
  return (
    <span
      aria-hidden="true"
      data-slot="touch-indicator"
      data-active={active}
      className="pointer-events-none absolute left-(--touch-x) top-(--touch-y) size-6 -translate-x-1/2 -translate-y-1/2 rounded-full border border-primary/60 bg-primary/25 ring-2 ring-background/50 transition-opacity duration-300 data-[active=false]:opacity-0"
      style={{ "--touch-x": `${x}%`, "--touch-y": `${y}%` } as CSSProperties}
    />
  );
}
