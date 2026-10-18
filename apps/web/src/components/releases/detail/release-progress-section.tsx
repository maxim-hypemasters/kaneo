import { useId } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useGetReleaseProgress } from "@/hooks/queries/release/use-get-release-progress";
import type { ReleaseItemCounts } from "@/lib/releases/release-progress";
import type { Release } from "@/types/release";
import { ReleaseCounts } from "../release-counts-text";
import { ReleaseDates } from "../release-dates";
import { ReleaseProgressChart } from "./release-progress-chart";

export function ReleaseProgressSection({
  release,
  counts,
  today,
}: {
  release: Release;
  counts: ReleaseItemCounts;
  today: string;
}) {
  const { t } = useTranslation();
  const id = useId();
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const progress = useGetReleaseProgress(
    release.projectId,
    release.id,
    timeZone,
  );

  return (
    <section
      aria-labelledby={id}
      className="space-y-4 border-border/80 border-b px-4 pt-3 pb-5 sm:px-6"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2 id={id} className="font-medium text-sm">
            {t("tasks:releases.chart.title")}
          </h2>
          <span className="text-muted-foreground text-xs">
            {t("tasks:releases.chart.tasksOnly")}
          </span>
        </div>
        <ReleaseCounts counts={counts} className="whitespace-normal" />
      </div>
      {progress.data ? (
        <ReleaseProgressChart
          release={release}
          history={progress.data}
          timeZone={timeZone}
        />
      ) : progress.isError ? (
        <div className="flex min-h-44 flex-col items-center justify-center gap-3 text-muted-foreground text-sm">
          <p role="alert">{t("tasks:releases.chart.loadError")}</p>
          <Button
            variant="outline"
            size="sm"
            disabled={progress.isFetching}
            onClick={() => void progress.refetch()}
          >
            {t("tasks:releases.retry")}
          </Button>
        </div>
      ) : (
        <div role="status">
          <span className="sr-only">{t("tasks:releases.chart.loading")}</span>
          <Skeleton aria-hidden="true" className="h-48 w-full" />
        </div>
      )}
      {!progress.data ? (
        <ReleaseDates release={release} today={today} labels="visible" />
      ) : null}
    </section>
  );
}
