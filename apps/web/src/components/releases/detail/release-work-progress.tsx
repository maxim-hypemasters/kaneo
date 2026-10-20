import { useTranslation } from "react-i18next";
import { SubtaskProgressGlyph } from "@/components/task-chips/subtask-progress-glyph";
import type { ReleaseWorkProgress as Progress } from "./release-milestone-groups";

export function ReleaseWorkProgress({
  progress,
  ready,
  glyph = false,
}: {
  progress: Progress;
  ready: boolean;
  glyph?: boolean;
}) {
  const { t } = useTranslation();
  const percentage =
    progress.total > 0
      ? Math.round((progress.completed / progress.total) * 100)
      : 0;
  if (!ready) {
    return (
      <span
        role="status"
        aria-label={t("tasks:releases.detail.progressLoading")}
        className="inline-flex shrink-0 items-center text-muted-foreground text-xs"
      >
        <span aria-hidden="true">—</span>
      </span>
    );
  }
  return (
    <span
      role="img"
      aria-label={t("tasks:releases.detail.progressInRelease", {
        ...progress,
        percentage,
      })}
      className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap text-muted-foreground text-xs tabular-nums"
    >
      {glyph && (
        <span className="size-3.5">
          <SubtaskProgressGlyph
            completed={progress.completed}
            total={progress.total}
          />
        </span>
      )}
      <span aria-hidden="true">
        {percentage}% · {progress.completed}/{progress.total}
      </span>
    </span>
  );
}
