"use client";

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import { Tabs as TabsPrimitive } from "radix-ui";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

function Tabs({
  className,
  orientation = "horizontal",
  variant = "default",
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Root> & {
  variant?: "default" | "flush";
}) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      data-orientation={orientation}
      orientation={orientation}
      className={cn(
        "group/tabs flex gap-2 data-[orientation=horizontal]:flex-col",
        variant === "flush" && "gap-0",
        className,
      )}
      {...props}
    />
  );
}

const tabsListVariants = cva(
  "group/tabs-list inline-flex w-fit items-center justify-center rounded-lg p-[3px] text-muted-foreground group-data-[orientation=horizontal]/tabs:h-9 group-data-[orientation=vertical]/tabs:h-fit group-data-[orientation=vertical]/tabs:flex-col data-[variant=line]:rounded-none",
  {
    variants: {
      variant: {
        default: "bg-muted",
        line: "gap-1 bg-transparent",
        workspace:
          "h-12 min-w-0 max-w-full flex-1 justify-start gap-0 overflow-x-auto overflow-y-hidden rounded-none bg-transparent p-0 group-data-[orientation=horizontal]/tabs:h-12",
        inspector:
          "h-12 w-full shrink-0 flex-none justify-start gap-0 rounded-none border-b bg-muted/40 p-0 group-data-[orientation=horizontal]/tabs:h-12",
        settings:
          "w-40 shrink-0 justify-start gap-2 rounded-none border-r bg-transparent p-0 pr-3 group-data-[orientation=vertical]/tabs:h-full [&_[data-slot=tabs-trigger]]:h-10 [&_[data-slot=tabs-trigger]]:flex-none",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

function TabsList({
  className,
  variant = "default",
  ...props
}: React.ComponentProps<typeof TabsPrimitive.List> &
  VariantProps<typeof tabsListVariants>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      data-variant={variant}
      className={cn(tabsListVariants({ variant }), className)}
      {...props}
    />
  );
}

function TabsTrigger({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      className={cn(
        "relative inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center gap-1.5 rounded-md border border-transparent px-2 py-1 text-sm font-medium whitespace-nowrap text-foreground/60 transition-all group-data-[orientation=vertical]/tabs:w-full group-data-[orientation=vertical]/tabs:justify-start hover:text-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-1 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50 group-data-[variant=default]/tabs-list:data-[state=active]:shadow-sm group-data-[variant=line]/tabs-list:data-[state=active]:shadow-none dark:text-muted-foreground dark:hover:text-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        "group-data-[variant=line]/tabs-list:bg-transparent group-data-[variant=line]/tabs-list:data-[state=active]:bg-transparent dark:group-data-[variant=line]/tabs-list:data-[state=active]:border-transparent dark:group-data-[variant=line]/tabs-list:data-[state=active]:bg-transparent",
        "data-[state=active]:bg-background data-[state=active]:text-foreground dark:data-[state=active]:border-input dark:data-[state=active]:bg-input/30 dark:data-[state=active]:text-foreground",
        "after:absolute after:bg-foreground after:opacity-0 after:transition-opacity group-data-[orientation=horizontal]/tabs:after:inset-x-0 group-data-[orientation=horizontal]/tabs:after:bottom-[-5px] group-data-[orientation=horizontal]/tabs:after:h-0.5 group-data-[orientation=vertical]/tabs:after:inset-y-0 group-data-[orientation=vertical]/tabs:after:-right-1 group-data-[orientation=vertical]/tabs:after:w-0.5 group-data-[variant=line]/tabs-list:data-[state=active]:after:opacity-100",
        className,
      )}
      {...props}
    />
  );
}

function TabsContent({
  className,
  variant = "default",
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Content> & {
  variant?: "default" | "remote" | "settings" | "table";
}) {
  return (
    <TabsPrimitive.Content
      data-slot="tabs-content"
      className={cn(
        "flex-1 outline-none",
        variant === "table" && "space-y-2",
        variant === "remote" &&
          "flex min-h-0 flex-col gap-3 data-[state=inactive]:hidden",
        variant === "settings" &&
          "min-h-0 min-w-0 space-y-5 overflow-y-auto px-3 pb-4",
        className,
      )}
      {...props}
    />
  );
}

function WorkspaceTab({
  value,
  label,
  icon,
  active,
  onClose,
  reorderable = false,
}: {
  value: string;
  label: string;
  icon: React.ReactNode;
  active: boolean;
  onClose?: () => void;
  reorderable?: boolean;
}) {
  return (
    <div
      data-slot="workspace-tab"
      data-tab-value={value}
      draggable={reorderable}
      data-state={active ? "active" : "inactive"}
      className="flex h-12 shrink-0 items-center border-r border-t-2 border-t-transparent text-muted-foreground transition-colors hover:bg-accent/50 data-[state=active]:border-t-primary data-[state=active]:bg-background data-[state=active]:text-foreground"
    >
      <TabsPrimitive.Trigger
        value={value}
        title={label}
        className="inline-flex h-full min-w-0 flex-1 items-center justify-center gap-2 px-3 py-2 text-sm font-medium outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0"
        onKeyDown={(event) => {
          if (event.key === "Delete" && onClose) {
            event.preventDefault();
            onClose();
          }
        }}
      >
        {icon}
        <span className="max-w-40 truncate">{label}</span>
      </TabsPrimitive.Trigger>
      {onClose && (
        <Button
          variant="ghost"
          size="icon-xs"
          className="mr-2"
          aria-label={label + " 탭 닫기"}
          onClick={onClose}
        >
          <X />
        </Button>
      )}
    </div>
  );
}

export {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  WorkspaceTab,
  tabsListVariants,
};

export function PanelTabsList({
  value,
  label,
  items,
  trailing,
}: {
  value: string;
  label: string;
  items: { value: string; label: string; icon: React.ReactNode }[];
  trailing?: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 items-center border-b bg-muted/40">
      <TabsList
        variant="inspector"
        aria-label={label}
        className="min-w-0 flex-1 overflow-x-auto"
      >
        {items.map((item) => (
          <WorkspaceTab
            key={item.value}
            {...item}
            active={value === item.value}
          />
        ))}
      </TabsList>
      {trailing && (
        <span className="shrink-0 px-3 text-xs text-muted-foreground">
          {trailing}
        </span>
      )}
    </div>
  );
}
