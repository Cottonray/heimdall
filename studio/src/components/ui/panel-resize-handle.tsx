import { useRef, useState } from "react";
export function PanelResizeHandle({ targetId }: { targetId: string }) {
  const pointer = useRef<number | null>(null);
  const [width, setWidth] = useState(60);
  const resize = (value: number) => {
    const next = Math.max(25, Math.min(75, value));
    const panel = document.getElementById(targetId);
    if (panel) panel.style.width = `${next}%`;
    setWidth(Math.round(next));
  };
  return (
    <div
      role="slider"
      aria-label="웹 디버깅 패널 너비"
      aria-orientation="horizontal"
      aria-valuemin={25}
      aria-valuemax={75}
      aria-valuenow={width}
      tabIndex={0}
      className="relative w-1 shrink-0 cursor-col-resize touch-none bg-border hover:bg-primary focus-visible:bg-primary focus-visible:outline-none"
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
