import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

interface PageHeaderProps {
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  className,
}: PageHeaderProps) {
  return (
    <header
      className={cn(
        "flex flex-col gap-3 pb-6 md:flex-row md:items-end md:justify-between md:gap-6",
        className,
      )}
    >
      <div className="min-w-0 flex-1">
        {eyebrow ? <p className="text-eyebrow mb-2">{eyebrow}</p> : null}
        <h1 className="text-display-md text-balance">{title}</h1>
        {description ? (
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </header>
  );
}
