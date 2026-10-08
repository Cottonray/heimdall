"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

function Table({
  className,
  variant = "default",
  columnWidths,
  fillColumnIndex,
  ...props
}: React.ComponentProps<"table"> & {
  variant?: "default" | "bordered";
  columnWidths?: (number | undefined)[];
  fillColumnIndex?: number;
}) {
  const tableRef = React.useRef<HTMLTableElement>(null);
  const resolvedWidths = React.useRef<number[]>([]);
  const previousWidths = React.useRef<(number | undefined)[]>([]);
  React.useLayoutEffect(() => {
    const table = tableRef.current;
    const container = table?.parentElement;
    if (!table || !container || !columnWidths) return;
    const changedIndex = columnWidths.findIndex(
      (width, index) => width !== previousWidths.current[index],
    );
    previousWidths.current = [...columnWidths];
    const update = () => {
      const defaultWidth = Math.min(
        1200,
        Math.max(
          160,
          (container.clientWidth -
            columnWidths.reduce<number>(
              (sum, width) => sum + (width ?? 0),
              0,
            )) /
            Math.max(
              1,
              columnWidths.filter((width) => width === undefined).length,
            ),
        ),
      );
      // Keep the initial widths of untouched columns instead of redistributing
      // the space left over whenever one column changes.
      if (resolvedWidths.current.length !== columnWidths.length)
        resolvedWidths.current = [];
      const widths = columnWidths.map(
        (width, index) =>
          width ?? resolvedWidths.current[index] ?? defaultWidth,
      );
      resolvedWidths.current = [...widths];
      const fillIndex = fillColumnIndex ?? widths.length - 1;
      if (fillIndex >= 0 && fillIndex < widths.length) {
        const total = widths.reduce((sum, width) => sum + width, 0);
        widths[fillIndex] += Math.max(0, container.clientWidth - total);
      }
      // Reserve fixed selection/action columns and fit data columns inside the viewport.
      const heads = Array.from(
        table.querySelectorAll<HTMLTableCellElement>("thead tr:first-child th"),
      );
      const flexible = widths
        .map((_, index) => index)
        .filter((index) => heads[index]?.querySelector('[role="slider"]'));
      let overflow =
        widths.reduce((sum, width) => sum + width, 0) - container.clientWidth;
      const shrinkOrder = [
        fillIndex,
        ...flexible.filter((index) => index !== fillIndex),
      ].filter((index) => flexible.includes(index));
      shrinkOrder.sort(
        (a, b) => Number(a === changedIndex) - Number(b === changedIndex),
      );
      for (const index of shrinkOrder) {
        if (overflow <= 0) break;
        const shrink = Math.min(overflow, Math.max(0, widths[index] - 120));
        widths[index] -= shrink;
        overflow -= shrink;
      }
      table.style.width = `${widths.reduce((sum, width) => sum + width, 0)}px`;
      table.querySelectorAll("col").forEach((col, index) => {
        col.style.width = `${widths[index]}px`;
      });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(container);
    return () => observer.disconnect();
  }, [columnWidths, fillColumnIndex]);
  return (
    <div
      data-slot="table-container"
      className={cn(
        "relative w-full overflow-x-auto",
        variant === "bordered" && "rounded-md border",
      )}
    >
      <table
        ref={tableRef}
        data-slot="table"
        className={cn(
          "w-full caption-bottom text-sm",
          columnWidths && "table-fixed",
          className,
        )}
        {...props}
      >
        {columnWidths && (
          <colgroup>
            {columnWidths.map((_, index) => (
              <col key={index} />
            ))}
          </colgroup>
        )}
        {props.children}
      </table>
    </div>
  );
}

function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
  return (
    <thead
      data-slot="table-header"
      className={cn("[&_tr]:border-b", className)}
      {...props}
    />
  );
}

function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return (
    <tbody
      data-slot="table-body"
      className={cn("[&_tr:last-child]:border-0", className)}
      {...props}
    />
  );
}

function TableFooter({ className, ...props }: React.ComponentProps<"tfoot">) {
  return (
    <tfoot
      data-slot="table-footer"
      className={cn(
        "border-t bg-muted/50 font-medium [&>tr]:last:border-b-0",
        className,
      )}
      {...props}
    />
  );
}

function TableRow({ className, variant = "default", ...props }: React.ComponentProps<"tr"> & { variant?: "default" | "static" }) {
  return (
    <tr
      data-slot="table-row"
      className={cn(
        "border-b transition-colors hover:bg-muted/50 has-aria-expanded:bg-muted/50 data-[state=selected]:bg-muted",
        variant === "static" && "hover:bg-transparent",
        className,
      )}
      {...props}
    />
  );
}

function TableHead({
  className,
  variant = "default",
  resizeLabel,
  onResize,
  ...props
}: React.ComponentProps<"th"> & {
  variant?: "default" | "selection" | "sortable";
  resizeLabel?: string;
  onResize?: (width: number) => void;
}) {
  const headRef = React.useRef<HTMLTableCellElement>(null);
  const drag = React.useRef<{
    pointerId: number;
    x: number;
    width: number;
  } | null>(null);
  const [width, setWidth] = React.useState(160);
  const resizable = !!onResize;
  React.useLayoutEffect(() => {
    const head = headRef.current;
    if (!head || !resizable) return;
    const update = () =>
      setWidth(Math.round(head.getBoundingClientRect().width));
    update();
    const observer = new ResizeObserver(update);
    observer.observe(head);
    return () => observer.disconnect();
  }, [resizable]);
  const resize = (value: number) => {
    const head = headRef.current;
    const table = head?.closest("table");
    const container = table?.parentElement;
    const others = table
      ? Array.from(
          table.querySelectorAll<HTMLTableCellElement>(
            "thead tr:first-child th",
          ),
        ).filter((cell) => cell !== head)
      : [];
    const reserved = others.reduce(
      (sum, cell) =>
        sum +
        (cell.querySelector('[role="slider"]')
          ? 120
          : cell.getBoundingClientRect().width),
      0,
    );
    const maximum = container
      ? Math.max(120, Math.min(1200, container.clientWidth - reserved))
      : 1200;
    const next = Math.round(Math.max(120, Math.min(maximum, value)));
    setWidth(next);
    onResize?.(next);
  };
  return (
    <th
      ref={headRef}
      data-slot="table-head"
      className={cn(
        "h-10 px-2 text-left align-middle font-medium whitespace-nowrap text-foreground [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]",
        variant === "selection" && "w-10",
        variant === "sortable" && "relative p-0",
        onResize && "relative",
        className,
      )}
      {...props}
    >
      {props.children}
      {onResize && (
        <span
          role="slider"
          tabIndex={0}
          aria-orientation="horizontal"
          aria-label={resizeLabel}
          aria-valuemin={120}
          aria-valuemax={1200}
          aria-valuenow={width}
          aria-valuetext={`${width}픽셀`}
          className="absolute inset-y-0 right-0 z-10 w-2 cursor-col-resize touch-none border-r border-transparent hover:border-primary focus-visible:border-primary focus-visible:outline-none"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
          onPointerDown={(event) => {
            if (event.button !== 0 || drag.current) return;
            event.preventDefault();
            event.stopPropagation();
            event.currentTarget.focus({ preventScroll: true });
            drag.current = {
              pointerId: event.pointerId,
              x: event.clientX,
              width:
                event.currentTarget.parentElement!.getBoundingClientRect()
                  .width,
            };
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => {
            if (drag.current?.pointerId === event.pointerId) {
              event.preventDefault();
              event.stopPropagation();
              resize(drag.current.width + event.clientX - drag.current.x);
            }
          }}
          onPointerUp={(event) => {
            if (drag.current?.pointerId !== event.pointerId) return;
            event.preventDefault();
            event.stopPropagation();
            drag.current = null;
            if (event.currentTarget.hasPointerCapture(event.pointerId))
              event.currentTarget.releasePointerCapture(event.pointerId);
          }}
          onPointerCancel={(event) => {
            if (drag.current?.pointerId === event.pointerId)
              drag.current = null;
          }}
          onLostPointerCapture={(event) => {
            if (drag.current?.pointerId === event.pointerId)
              drag.current = null;
          }}
          onKeyDown={(event) => {
            if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key))
              return;
            event.preventDefault();
            event.stopPropagation();
            const current =
              event.currentTarget.parentElement!.getBoundingClientRect().width;
            resize(
              event.key === "Home"
                ? 120
                : event.key === "End"
                  ? 1200
                  : current + (event.key === "ArrowRight" ? 16 : -16),
            );
          }}
        />
      )}
    </th>
  );
}

function TableCell({
  className,
  onClick,
  variant = "default",
  ...props
}: React.ComponentProps<"td"> & { variant?: "default" | "empty" | "action" | "row-action" }) {
  return (
    <td
      data-slot="table-cell"
      onClick={(event) => {
        onClick?.(event);
        if (event.defaultPrevented) return;
        const target = event.target as HTMLElement;
        // Preserve native control behavior and avoid recursively forwarding clicks.
        const controls =
          'button, a[href], input, select, textarea, [role="button"], [role="checkbox"], [contenteditable="true"]';
        if (target.closest(controls)) return;
        const actions =
          event.currentTarget.querySelectorAll<HTMLElement>(controls);
        if (actions.length !== 1) return;
        const action = actions[0];
        if (
          action.matches(
            ':disabled, [aria-disabled="true"], input, select, textarea, [role="checkbox"], [contenteditable="true"], [aria-haspopup]',
          )
        )
          return;
        action.click();
      }}
      className={cn(
        "overflow-hidden text-ellipsis p-2 align-middle whitespace-nowrap [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]",
        (variant === "action" || variant === "row-action") && "relative text-primary",
        variant === "action" && "hover:bg-accent/50",
        variant === "empty" && "h-24 text-center text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}

function TableCaption({
  className,
  visuallyHidden = false,
  ...props
}: React.ComponentProps<"caption"> & { visuallyHidden?: boolean }) {
  return (
    <caption
      data-slot="table-caption"
      className={cn(
        visuallyHidden ? "sr-only" : "mt-4 text-sm text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
};
