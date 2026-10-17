import { cn } from "@/lib/cn";

// The create dialog's chip look; `active` once the chip holds a value.
export function chipClass(active: boolean) {
  return cn(
    "flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors border border-border hover:bg-accent/50 disabled:pointer-events-none disabled:opacity-50",
    active ? "bg-accent/30 text-foreground" : "text-muted-foreground",
  );
}
