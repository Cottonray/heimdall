import { useEffect, useState } from "react";
import { AlertCircle, X } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ErrorToast({ message }: { message?: string }) {
  const [text, setText] = useState("");
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!message) {
      setVisible(false);
      return;
    }
    setText(message);
    setVisible(true);
    const timer = window.setTimeout(() => setVisible(false), 6000);
    return () => window.clearTimeout(timer);
  }, [message]);
  useEffect(() => {
    if (visible) return;
    const timer = window.setTimeout(() => setText(""), 180);
    return () => window.clearTimeout(timer);
  }, [visible]);
  if (!text) return null;
  return (
    <div className="pointer-events-none fixed inset-x-4 top-20 z-100 flex justify-center">
      <div
        role="alert"
        data-state={visible ? "open" : "closed"}
        className="error-toast pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-xl border border-border bg-background p-3 text-sm shadow-lg"
      >
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-destructive/10 text-destructive">
          <AlertCircle aria-hidden="true" className="size-4" />
        </span>
        <p className="min-w-0 flex-1 self-center break-words leading-5 text-foreground">
          {text}
        </p>
        <Button
          variant="ghost"
          size="icon-sm"
          className="shrink-0 text-muted-foreground"
          aria-label="오류 알림 닫기"
          onClick={() => setVisible(false)}
        >
          <X />
        </Button>
      </div>
    </div>
  );
}
