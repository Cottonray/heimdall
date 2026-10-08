import { useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function RefreshControl({
  onRefresh,
  busy = false,
  active = true,
  storageKey,
}: {
  onRefresh: () => void;
  busy?: boolean;
  active?: boolean;
  storageKey: string;
}) {
  const [interval, setIntervalValue] = useState(() => {
    try {
      const saved = Number(
        localStorage.getItem(`heimdall-refresh-${storageKey}`),
      );
      return [0, 3, 5, 10, 30, 60].includes(saved) ? saved : 0;
    } catch {
      return 0;
    }
  });
  const latest = useRef({ onRefresh, busy });
  latest.current = { onRefresh, busy };
  useEffect(() => {
    if (!active || !interval) return;
    const timer = window.setInterval(() => {
      if (!document.hidden && !latest.current.busy) latest.current.onRefresh();
    }, interval * 1000);
    return () => window.clearInterval(timer);
  }, [active, interval]);
  return (
    <div
      role="group"
      aria-label="새로고침 설정"
      className="inline-flex shrink-0 items-center"
    >
      <Select
        value={String(interval)}
        onValueChange={(value) => {
          setIntervalValue(Number(value));
          try {
            localStorage.setItem(`heimdall-refresh-${storageKey}`, value);
          } catch {
            /* Storage may be unavailable. */
          }
        }}
      >
        <SelectTrigger
          aria-label="새로고침 주기"
          className="w-28 rounded-r-none shadow-none"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {[0, 3, 5, 10, 30, 60].map((seconds) => (
            <SelectItem key={seconds} value={String(seconds)}>
              {seconds ? `${seconds}초` : "수동"}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        variant="outline"
        disabled={busy}
        onClick={onRefresh}
        className="-ml-px rounded-l-none shadow-none"
      >
        <RefreshCw className={busy ? "animate-spin" : undefined} />
        새로고침
      </Button>
    </div>
  );
}
