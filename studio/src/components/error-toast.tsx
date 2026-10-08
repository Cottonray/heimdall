import { useEffect, useState } from "react";
import { AlertCircle, X } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ErrorToast({ message }: { message?: string }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    setVisible(!!message);
    if (!message) return;
    const timer = window.setTimeout(() => setVisible(false), 6000);
    return () => window.clearTimeout(timer);
  }, [message]);
  if (!message || !visible) return null;
  return (
    <div
      role="alert"
      className="fixed left-1/2 top-4 z-[100] flex w-max max-w-[calc(100vw-2rem)] -translate-x-1/2 items-center gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 shadow-lg dark:border-red-900 dark:bg-red-950 dark:text-red-200"
    >
      <AlertCircle aria-hidden="true" className="size-4 shrink-0" />
      <p className="min-w-0 break-words leading-5">{message}</p>
      <Button
        variant="ghost"
        size="icon-sm"
        className="shrink-0 text-inherit hover:bg-red-100 dark:hover:bg-red-900"
        aria-label="오류 알림 닫기"
        onClick={() => setVisible(false)}
      >
        <X />
      </Button>
    </div>
  );
}
