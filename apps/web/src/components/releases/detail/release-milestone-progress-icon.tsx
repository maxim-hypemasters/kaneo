import { ProgressDiamond } from "@/components/shared/progress-diamond";
import { cn } from "@/lib/cn";
import type { ReleaseWorkProgress } from "./release-milestone-groups";

export function ReleaseMilestoneProgressIcon({
  progress,
  ready,
  unassigned,
  className,
}: {
  progress: ReleaseWorkProgress;
  ready: boolean;
  unassigned: boolean;
  className?: string;
}) {
  const ratio =
    ready && !unassigned && progress.total > 0
      ? progress.completed / progress.total
      : 0;

  return (
    <ProgressDiamond
      ratio={ratio}
      className={cn(
        "size-3.5 shrink-0 text-muted-foreground",
        className,
        unassigned && "[stroke-dasharray:2_2]",
        ready && !unassigned && progress.started > 0 && "text-amber-500",
        ratio >= 1 && "fill-primary text-primary",
      )}
    />
  );
}
