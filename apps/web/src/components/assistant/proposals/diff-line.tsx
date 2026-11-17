import { useTranslation } from "react-i18next";
import { cn } from "@/lib/cn";
import type { DiffRow } from "./build-diff-rows";

// The gutter marks each line for sighted readers; assistive tech hears the
// words instead.
const GUTTER = { added: "+", removed: "−", unchanged: "" } as const;

// One row of a diff: a line with its change, or folded unchanged lines.
export function DiffLine({ row }: { row: DiffRow }) {
  const { t } = useTranslation();

  if (row.kind === "skipped") {
    return (
      <div className="bg-muted/50 px-2 py-0.5 text-muted-foreground italic">
        {t("workspace:assistant.proposal.diff.unchanged", { count: row.count })}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex",
        row.kind === "added" && "bg-success/10",
        row.kind === "removed" && "bg-destructive/10",
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "w-5 shrink-0 select-none text-center",
          row.kind === "added" && "text-success-foreground",
          row.kind === "removed" && "text-destructive-foreground",
        )}
      >
        {GUTTER[row.kind]}
      </span>
      <span className="min-w-0 flex-1 whitespace-pre-wrap break-words pe-2">
        {row.kind === "unchanged" ? null : (
          <span className="sr-only">
            {row.kind === "added"
              ? t("workspace:assistant.proposal.diff.added")
              : t("workspace:assistant.proposal.diff.removed")}
            :{" "}
          </span>
        )}
        {row.text || " "}
      </span>
    </div>
  );
}
