import { useLayoutEffect, useRef, useState } from "react";
export function PanelResizeHandle({
  targetId,
  label = "웹 디버깅 패널 너비",
  initialWidth = 60,
  storageKey,
  orientation = "horizontal",
  autoSize,
  minSize = 25,
}: {
  autoSize?: string;
  minSize?: number;
  targetId: string;
  label?: string;
  initialWidth?: number;
  storageKey?: string;
  orientation?: "horizontal" | "vertical";
}) {
  const pointer = useRef<number | null>(null);
  const [width, setWidth] = useState<number | null>(() => {
    if (storageKey) {
      try {
        const saved = localStorage.getItem(storageKey);
        const value = saved === null ? NaN : Number(saved);
        if (Number.isFinite(value) && value >= minSize && value <= 75) return value;
      } catch {
        /* Storage may be unavailable. */
      }
    }
    return autoSize ? null : initialWidth;
  });
  useLayoutEffect(() => {
    const panel = document.getElementById(targetId);
    if (panel)
      panel.style[orientation === "vertical" ? "height" : "width"] =
        width === null ? autoSize! : `${width}%`;
  }, [targetId, width, orientation, autoSize]);
  const resize = (value: number) => {
    const next = Math.max(minSize, Math.min(75, value));
    const panel = document.getElementById(targetId);
    if (panel)
      panel.style[orientation === "vertical" ? "height" : "width"] = `${next}%`;
    setWidth(next);
    if (storageKey) {
      try {
        localStorage.setItem(storageKey, String(next));
      } catch {
        /* Keep resizing without storage. */
      }
    }
  };
  return (
    <div
      role="slider"
      aria-label={label}
      aria-orientation={orientation}
      aria-valuemin={minSize}
      aria-valuemax={75}
      aria-valuenow={width ?? initialWidth}
      tabIndex={0}
      className={
        orientation === "vertical"
          ? "relative z-10 h-px shrink-0 cursor-row-resize touch-none bg-border before:absolute before:inset-x-0 before:-inset-y-1 before:content-[''] hover:bg-primary focus-visible:bg-primary focus-visible:outline-none"
          : "relative z-10 w-px shrink-0 cursor-col-resize touch-none bg-border before:absolute before:inset-y-0 before:-inset-x-1 before:content-[''] hover:bg-primary focus-visible:bg-primary focus-visible:outline-none"
      }
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        pointer.current = event.pointerId;
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        if (pointer.current !== event.pointerId) return;
        const rect = event.currentTarget.parentElement!.getBoundingClientRect();
        resize(
          orientation === "vertical"
            ? ((rect.bottom - event.clientY) / rect.height) * 100
            : ((rect.right - event.clientX) / rect.width) * 100,
        );
      }}
      onPointerUp={(event) => {
        pointer.current = null;
        if (event.currentTarget.hasPointerCapture(event.pointerId))
          event.currentTarget.releasePointerCapture(event.pointerId);
      }}
      onPointerCancel={() => {
        pointer.current = null;
      }}
      onLostPointerCapture={() => {
        pointer.current = null;
      }}
      onKeyDown={(event) => {
        const increase = orientation === "vertical" ? "ArrowUp" : "ArrowLeft";
        const decrease =
          orientation === "vertical" ? "ArrowDown" : "ArrowRight";
        if (event.key === increase || event.key === decrease) {
          event.preventDefault();
          resize((width ?? initialWidth) + (event.key === increase ? 5 : -5));
        }
      }}
    />
  );
}
