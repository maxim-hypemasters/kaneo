import { Diamond } from "lucide-react";
import { useId } from "react";
import { cn } from "@/lib/cn";
import type { ReleaseWorkProgress } from "./release-milestone-groups";

export function ReleaseMilestoneProgressIcon({
  progress,
  ready,
  unassigned,
}: {
  progress: ReleaseWorkProgress;
  ready: boolean;
  unassigned: boolean;
}) {
  const clipId = useId();
  const ratio =
    ready && !unassigned && progress.total > 0
      ? Math.min(1, Math.max(0, progress.completed / progress.total))
      : 0;
  const partial = ratio > 0 && ratio < 1;
  const angle = ratio * 2 * Math.PI;
  const sector = `M 12 12 L 12 -12 A 24 24 0 ${ratio > 0.5 ? 1 : 0} 1 ${12 + 24 * Math.sin(angle)} ${12 - 24 * Math.cos(angle)} Z`;

  return (
    <Diamond
      aria-hidden="true"
      className={cn(
        "size-3.5 shrink-0 text-muted-foreground",
        unassigned && "[stroke-dasharray:2_2]",
        ready && !unassigned && progress.started > 0 && "text-amber-500",
        ratio === 1 && "fill-primary text-primary",
      )}
      fill={ratio === 1 ? "currentColor" : "none"}
    >
      {partial && (
        <>
          <defs>
            <clipPath id={clipId}>
              <path d={sector} />
            </clipPath>
          </defs>
          <g clipPath={`url(#${clipId})`}>
            <Diamond fill="currentColor" stroke="none" />
          </g>
        </>
      )}
    </Diamond>
  );
}
