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
      className="fixed left-1/2 top-4 z-100 flex w-11/12 max-w-xl -translate-x-1/2 items-center gap-3 rounded-lg border border-destructive/20 bg-background px-4 py-3 text-sm text-destructive shadow-lg"
    >
      <AlertCircle aria-hidden="true" className="size-4 shrink-0" />
      <p className="min-w-0 break-words leading-5">{message}</p>
      <Button
        variant="danger-ghost"
        size="icon-sm"
        aria-label="오류 알림 닫기"
        onClick={() => setVisible(false)}
      >
        <X />
      </Button>
    </div>
  );
}
