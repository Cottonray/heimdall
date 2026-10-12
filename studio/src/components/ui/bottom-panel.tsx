import { useState, type ReactNode } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "./button";
import { PanelResizeHandle } from "./panel-resize-handle";

export function BottomPanel({
  id,
  storageKey,
  children,
}: {
  id: string;
  storageKey: string;
  children: ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(storageKey + ":collapsed") === "true";
    } catch {
      return false;
    }
  });
  return (
    <>
      {!collapsed && (
        <PanelResizeHandle
          targetId={id}
          orientation="vertical"
          label="AI 패널 높이"
          initialWidth={40}
          storageKey={storageKey + ":height"}
        />
      )}
      <section
        id={id}
        aria-label="AI 시나리오"
        className={
          collapsed
            ? "flex h-auto! shrink-0 flex-col border-t"
            : "flex h-1/2 min-h-0 shrink-0 flex-col"
        }
      >
        <div className="flex shrink-0 items-center justify-between gap-2 px-3 py-1">
          <span className="text-sm font-medium">Codex 터미널</span>
          <Button
            variant="ghost"
            size="sm"
            aria-expanded={!collapsed}
            aria-controls={id + "-content"}
            aria-label={collapsed ? "AI 패널 펼치기" : "AI 패널 접기"}
            onClick={() => {
              setCollapsed(!collapsed);
              try {
                localStorage.setItem(
                  storageKey + ":collapsed",
                  String(!collapsed),
                );
              } catch {
                /* Optional persistence. */
              }
            }}
          >
            {collapsed ? <ChevronUp /> : <ChevronDown />}
            {collapsed ? "펼치기" : "접기"}
          </Button>
        </div>
        <div
          id={id + "-content"}
          hidden={collapsed}
          className="min-h-0 flex-1 overflow-hidden"
        >
          {children}
        </div>
      </section>
    </>
  );
}
