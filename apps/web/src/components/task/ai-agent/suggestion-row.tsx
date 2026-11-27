import type { ReactNode } from "react";

type SuggestionRowProps = {
  icon: ReactNode;
  /** What Apply sets, in a few words. */
  label: string;
  /** Hermes' reason, shown muted; may be empty. */
  reason: string;
  actions: ReactNode;
  children?: ReactNode;
};

// One field suggestion: what it sets, details, why, then Apply and Dismiss.
export function SuggestionRow({
  icon,
  label,
  reason,
  actions,
  children,
}: SuggestionRowProps) {
  return (
    <li className="space-y-1.5 rounded-lg border border-border bg-background/60 p-3">
      <p className="flex items-start gap-1.5 font-medium text-sm">
        <span className="flex h-5 shrink-0 items-center">{icon}</span>
        <span className="min-w-0 break-words">{label}</span>
      </p>
      {children}
      {reason ? (
        <p className="break-words text-muted-foreground text-xs">{reason}</p>
      ) : null}
      {actions}
    </li>
  );
}
