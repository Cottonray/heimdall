import { useEffect, useState } from "react";
import { Bell, CheckCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { API } from "@/lib/api";
import type { StudioNotification } from "../../../../contracts/studio";

export function NotificationInbox({ userId }: { userId: string }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<StudioNotification[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    let pending = false;
    async function refresh() {
      if (pending) return;
      pending = true;
      try {
        const response = await fetch(`${API}/notifications`, {
          signal: AbortSignal.any([
            controller.signal,
            AbortSignal.timeout(10000),
          ]),
        });
        if (!response.ok) throw new Error();
        const result = (await response.json()) as StudioNotification[];
        if (!controller.signal.aborted) {
          setItems(result);
          setError("");
        }
      } catch {
        if (!controller.signal.aborted) setError("알림을 불러오지 못했어요.");
      } finally {
        pending = false;
      }
    }
    void refresh();
    const timer = setInterval(() => void refresh(), 15000);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, [userId]);
  async function mark(ids: string[]) {
    setBusy(true);
    try {
      const response = await fetch(`${API}/notifications/read`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      if (!response.ok) throw new Error();
      setItems((previous) =>
        previous.map((item) =>
          ids.includes(item.id) ? { ...item, read: true } : item,
        ),
      );
      setError("");
    } catch {
      setError("읽음 상태를 저장하지 못했어요.");
    } finally {
      setBusy(false);
    }
  }
  const unread = items.filter((item) => !item.read);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="notification"
          size="icon"
          title="알림함"
          aria-label={`알림함${unread.length ? ` · 안 읽은 알림 ${unread.length}개` : ""}`}
        >
          <Bell aria-hidden="true" className="size-4.5" />
          {unread.length > 0 && (
            <span
              aria-hidden="true"
              className="pointer-events-none absolute right-2 top-1.5 size-1.5 rounded-full bg-primary ring-2 ring-background"
            />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent aria-label="알림함">
        <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold">알림함</h2>
            {unread.length > 0 && (
              <span className="text-xs text-muted-foreground">
                안 읽음 {unread.length}
              </span>
            )}
          </div>
          {unread.length > 0 && (
            <Button
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() => void mark(unread.map((item) => item.id))}
            >
              <CheckCheck />
              모두 읽음
            </Button>
          )}
        </div>
        {error && (
          <p role="alert" className="px-4 py-3 text-sm text-destructive">
            {error}
          </p>
        )}
        <div className="max-h-96 overflow-y-auto">
          {!items.length && !error && (
            <div className="flex flex-col items-center gap-3 px-4 py-10 text-muted-foreground">
              <Bell />
              <p className="text-sm">새로운 알림이 없어요.</p>
            </div>
          )}
          {items.map((item) => (
            <div
              key={item.id}
              className="space-y-2 border-b px-4 py-3 last:border-b-0"
            >
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm font-medium">{item.title}</p>
                {!item.read && (
                  <span className="text-xs text-primary" aria-label="안 읽음">
                    ●
                  </span>
                )}
              </div>
              <p className="text-sm text-muted-foreground">{item.message}</p>
              <div className="flex items-center justify-between gap-3">
                <time
                  className="text-xs text-muted-foreground"
                  dateTime={item.at}
                >
                  {new Date(item.at).toLocaleString("ko-KR", {
                    month: "long",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </time>
                {!item.read && (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy}
                    onClick={() => void mark([item.id])}
                  >
                    읽음
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
