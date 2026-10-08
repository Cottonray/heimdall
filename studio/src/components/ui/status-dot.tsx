import { cn } from "@/lib/utils";

export function StatusDot({
  state,
  label,
}: {
  state: "connecting" | "paused" | "closed" | "ready";
  label: string;
}) {
  return (
    <span
      role="status"
      aria-label={label}
      title={label}
      className={cn(
        "inline-block size-2 shrink-0 rounded-full",
        state === "ready"
          ? "bg-success"
          : state === "closed"
            ? "bg-destructive"
            : state === "connecting"
              ? "bg-primary animate-pulse"
              : "bg-muted-foreground",
      )}
    />
  );
}
