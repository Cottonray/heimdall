import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

// Coordinate input must never scale, acquire padding, or fade when disabled.
export function PreviewSurface({
  className,
  variant = "default",
  ...props
}: ComponentProps<"button"> & { variant?: "default" | "remote" }) {
  return (
    <button
      {...props}
      type="button"
      data-slot="preview-surface"
      data-press-feedback="off"
      className={cn(
        "block max-w-full outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default",
        variant === "remote" && "h-full max-h-full touch-none",
        className,
      )}
    />
  );
}
