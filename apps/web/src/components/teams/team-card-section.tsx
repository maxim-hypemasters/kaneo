import type { ReactNode } from "react";

// One column of a team card: a heading with its add button, then the list.
export function TeamCardSection({
  title,
  action,
  empty,
  children,
}: {
  title: string;
  action?: ReactNode;
  empty: string | null;
  children: ReactNode;
}) {
  return (
    <section aria-label={title} className="min-w-0 pb-2">
      <div className="flex min-h-10 items-center justify-between gap-2 px-4 pt-2">
        <h3 className="text-xs font-medium text-muted-foreground">{title}</h3>
        {action}
      </div>
      {empty ? (
        <p className="px-4 py-1.5 text-xs text-muted-foreground">{empty}</p>
      ) : (
        <ul>{children}</ul>
      )}
    </section>
  );
}
