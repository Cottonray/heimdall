import { useLayoutEffect, useRef, type ReactNode } from "react";
import { TabsList } from "./tabs";

/** Native tab drag with FLIP animation; Alt + arrows provides keyboard reordering. */
export function SortableTabsList({
  children,
  order,
  onMove,
}: {
  children: ReactNode;
  order: string[];
  onMove: (from: string, to: string) => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const dragging = useRef<string | null>(null);
  const positions = useRef(new Map<string, number>());
  const animations = useRef<Animation[]>([]);
  const lastMove = useRef(0);
  const nodes = () =>
    Array.from(
      root.current?.querySelectorAll<HTMLElement>("[data-tab-value]") || [],
    );
  function move(from: string, to: string) {
    positions.current = new Map(
      nodes().map((node) => [
        node.dataset.tabValue!,
        node.getBoundingClientRect().left,
      ]),
    );
    onMove(from, to);
  }
  useLayoutEffect(() => {
    animations.current.forEach((animation) => animation.cancel());
    animations.current = [];
    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      for (const node of nodes()) {
        const old = positions.current.get(node.dataset.tabValue!);
        if (old === undefined) continue;
        const offset = old - node.getBoundingClientRect().left;
        if (offset)
          animations.current.push(
            node.animate(
              [
                { transform: `translateX(${offset}px)` },
                { transform: "translateX(0)" },
              ],
              { duration: 200, easing: "cubic-bezier(.2,.8,.2,1)" },
            ),
          );
      }
    }
    positions.current.clear();
  }, [order]);
  useLayoutEffect(
    () => () => animations.current.forEach((animation) => animation.cancel()),
    [],
  );
  return (
    <TabsList
      ref={root}
      variant="workspace"
      aria-label="열린 작업"
      onDragStart={(event) => {
        const node = (event.target as HTMLElement).closest<HTMLElement>(
          "[data-tab-value]",
        );
        if (
          !node ||
          node.getAttribute("draggable") !== "true" ||
          (event.target as HTMLElement).closest('[data-slot="button"]')
        ) {
          event.preventDefault();
          return;
        }
        dragging.current = node.dataset.tabValue!;
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", dragging.current);
        // Keep the real tabs' FLIP movement without a second browser drag ghost.
        const transparent = document.createElement("canvas");
        transparent.width = transparent.height = 1;
        event.dataTransfer.setDragImage(transparent, 0, 0);
      }}
      onDragOver={(event) => {
        const from = dragging.current;
        if (!from) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        const rect = event.currentTarget.getBoundingClientRect();
        if (event.clientX < rect.left + 32)
          event.currentTarget.scrollLeft -= 16;
        if (event.clientX > rect.right - 32)
          event.currentTarget.scrollLeft += 16;
        if (Date.now() - lastMove.current < 220) return;
        const target = nodes().find((node) => {
          const r = node.getBoundingClientRect();
          return event.clientX >= r.left && event.clientX <= r.right;
        });
        const to = target?.dataset.tabValue;
        if (!to || to === from) return;
        const r = target!.getBoundingClientRect();
        const forward = order.indexOf(from) < order.indexOf(to);
        if (
          forward
            ? event.clientX < r.left + r.width / 2
            : event.clientX > r.left + r.width / 2
        )
          return;
        lastMove.current = Date.now();
        move(from, to);
      }}
      onDrop={(event) => {
        if (dragging.current) event.preventDefault();
        dragging.current = null;
      }}
      onDragEnd={() => {
        dragging.current = null;
      }}
      onKeyDown={(event) => {
        if (!event.altKey || !["ArrowLeft", "ArrowRight"].includes(event.key))
          return;
        const from = (event.target as HTMLElement).closest<HTMLElement>(
          "[data-tab-value]",
        )?.dataset.tabValue;
        if (!from) return;
        const to =
          order[order.indexOf(from) + (event.key === "ArrowLeft" ? -1 : 1)];
        event.preventDefault();
        event.stopPropagation();
        if (to) move(from, to);
      }}
    >
      {children}
    </TabsList>
  );
}
