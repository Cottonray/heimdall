import type { ReactNode } from "react";

export function PageHeader({
  title,
  description,
  actions,
  headingLevel: Heading = "h1",
}: {
  title: string;
  headingLevel?: "h1" | "h2";
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        <Heading className="text-2xl font-semibold tracking-tight">
          {title}
        </Heading>
        {description && (
          <p className="mt-2 text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {actions && (
        <div className="flex flex-wrap items-center gap-2">{actions}</div>
      )}
    </div>
  );
}
