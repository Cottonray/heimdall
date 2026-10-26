import { Progress as ProgressPrimitive } from "radix-ui";

export function Progress({ value, label }: { value: number; label: string }) {
  const percent = Math.max(0, Math.min(100, value));
  return (
    <ProgressPrimitive.Root value={percent} aria-label={label} className="relative h-2 w-full overflow-hidden rounded-full bg-primary/10">
      <ProgressPrimitive.Indicator className="h-full w-full bg-primary transition-transform motion-reduce:transition-none" style={{ transform: `translateX(-${100 - percent}%)` }} />
    </ProgressPrimitive.Root>
  );
}
