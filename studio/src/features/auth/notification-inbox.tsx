import { useEffect, useState } from "react";
import { Bell, CheckCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
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
    <>
      <Button
        variant="ghost"
        aria-label={`알림함${unread.length ? ` · 안 읽은 알림 ${unread.length}개` : ""}`}
        onClick={() => setOpen(true)}
      >
        <Bell />
        {unread.length > 0 && <Badge>{unread.length}</Badge>}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>알림함</DialogTitle>
            <DialogDescription>
              최근 테스트의 실패와 검증 결과를 확인해요.
            </DialogDescription>
          </DialogHeader>
          {unread.length > 0 && (
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => void mark(unread.map((item) => item.id))}
            >
              <CheckCheck />
              모두 읽음
            </Button>
          )}
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <div className="max-h-96 space-y-3 overflow-y-auto">
            {!items.length && !error && (
              <p className="py-8 text-center text-sm text-muted-foreground">
                새로운 알림이 없어요.
              </p>
            )}
            {items.map((item) => (
              <div key={item.id} className="space-y-2 rounded-lg border p-4">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm font-medium">{item.title}</p>
                  {!item.read && <Badge>새 알림</Badge>}
                </div>
                <p className="text-sm text-muted-foreground">{item.message}</p>
                <div className="flex items-center justify-between gap-3">
                  <time
                    className="text-xs text-muted-foreground"
                    dateTime={item.at}
                  >
                    {new Date(item.at).toLocaleString("ko-KR")}
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
        </DialogContent>
      </Dialog>
    </>
  );
}
