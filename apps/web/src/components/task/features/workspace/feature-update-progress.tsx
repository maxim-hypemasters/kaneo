import { Diamond } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { FeatureMilestoneSnapshot } from "@/fetchers/feature/types";
import { milestoneSnapshotPercent } from "./feature-update-data";

export function FeatureUpdateProgress({
  milestones,
  compact = false,
}: {
  milestones: FeatureMilestoneSnapshot[];
  compact?: boolean;
}) {
  const { t } = useTranslation();
  if (!milestones.length) return null;
  const shown = compact ? milestones.slice(0, 3) : milestones;
  return (
    <div className="space-y-2 border-l-2 border-border pl-3 text-xs">
      <p className="text-muted-foreground">
        {t(
          milestones.some((item) => item.previousTotal !== null)
            ? "tasks:features.workspace.progressChanges"
            : "tasks:features.workspace.milestoneProgress",
        )}
      </p>
      {shown.map((milestone) => (
        <div key={milestone.id} className="flex min-w-0 items-start gap-2">
          <Diamond
            className="mt-0.5 size-3 shrink-0 text-muted-foreground"
            aria-hidden
          />
          <span className="min-w-0 flex-1 truncate" title={milestone.title}>
            {milestone.title}
          </span>
          <span className="shrink-0 tabular-nums text-muted-foreground">
            {milestone.previousTotal !== null &&
              milestone.previousCompleted !== null && (
                <>
                  {milestoneSnapshotPercent(
                    milestone.previousCompleted,
                    milestone.previousTotal,
                  )}
                  % →{" "}
                </>
              )}
            {milestoneSnapshotPercent(milestone.completed, milestone.total)}% ·{" "}
            {milestone.completed}/{milestone.total}
          </span>
        </div>
      ))}
      {compact && milestones.length > shown.length && (
        <p className="text-muted-foreground">
          {t("tasks:features.workspace.moreMilestones", {
            count: milestones.length - shown.length,
          })}
        </p>
      )}
    </div>
  );
}
