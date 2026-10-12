import { useLayoutEffect, useRef, useState } from "react";
export function PanelResizeHandle({
  targetId,
  label = "웹 디버깅 패널 너비",
  initialWidth = 60,
  storageKey,
}: {
  targetId: string;
  label?: string;
  initialWidth?: number;
  storageKey?: string;
}) {
  const pointer = useRef<number | null>(null);
  const [width, setWidth] = useState(() => {
    if (storageKey) {
      try {
        const saved = localStorage.getItem(storageKey);
        const value = saved === null ? NaN : Number(saved);
        if (Number.isFinite(value) && value >= 25 && value <= 75) return value;
      } catch {
        /* Storage may be unavailable. */
      }
    }
    return initialWidth;
  });
  useLayoutEffect(() => {
    const panel = document.getElementById(targetId);
    if (panel) panel.style.width = `${width}%`;
  }, [targetId, width]);
  const resize = (value: number) => {
    const next = Math.max(25, Math.min(75, value));
    const panel = document.getElementById(targetId);
    if (panel) panel.style.width = `${next}%`;
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
      aria-orientation="horizontal"
      aria-valuemin={25}
      aria-valuemax={75}
      aria-valuenow={width}
      tabIndex={0}
      className="relative z-10 w-px shrink-0 cursor-col-resize touch-none bg-border before:absolute before:inset-y-0 before:-inset-x-1 before:content-[''] hover:bg-primary focus-visible:bg-primary focus-visible:outline-none"
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        pointer.current = event.pointerId;
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        if (pointer.current !== event.pointerId) return;
        const rect = event.currentTarget.parentElement!.getBoundingClientRect();
        resize(((rect.right - event.clientX) / rect.width) * 100);
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
        if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
          event.preventDefault();
          resize(width + (event.key === "ArrowLeft" ? 5 : -5));
        }
      }}
    />
  );
}
