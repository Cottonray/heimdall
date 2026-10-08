import * as React from "react";
import { Popover as Primitive } from "radix-ui";
import { cn } from "@/lib/utils";

export const Popover = Primitive.Root;
export const PopoverTrigger = Primitive.Trigger;
export function PopoverContent({
  className,
  ...props
}: React.ComponentProps<typeof Primitive.Content>) {
  return (
    <Primitive.Portal>
      <Primitive.Content
        align="end"
        sideOffset={8}
        collisionPadding={12}
        className={cn(
          "z-50 w-96 max-w-[calc(100vw-1.5rem)] max-h-(--radix-popover-content-available-height) overflow-y-auto rounded-xl border bg-popover text-popover-foreground shadow-lg outline-none",
          className,
        )}
        {...props}
      />
    </Primitive.Portal>
  );
}
