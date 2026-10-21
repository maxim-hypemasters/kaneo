import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { EMPTY_RELEASE_PROGRESS } from "@/lib/releases/upsert-release";
import type { ReleaseItemCounts } from "@/lib/releases/release-progress";
import type { Release } from "@/types/release";
import { countsFromProgress } from "../release-counts";
import type { ReleasePermissions } from "../use-release-permissions";
import { ReleaseRow } from "./release-row";
import { releaseTimelineOrder } from "./release-timeline";

type ReleaseListProps = {
  releases: readonly Release[];
  counts: ReadonlyMap<string, ReleaseItemCounts>;
  today: string;
  workspaceId: string;
  permissions: ReleasePermissions;
  onEdit: (release: Release) => void;
  onDelete: (release: Release) => void;
  onMoveUnfinished: (release: Release) => void;
  emptyState?: ReactNode;
};

const NO_COUNTS = countsFromProgress(EMPTY_RELEASE_PROGRESS);

export function ReleaseList({
  releases,
  counts,
  today,
  emptyState,
  ...rowProps
}: ReleaseListProps) {
  const { t } = useTranslation();
  const items = releaseTimelineOrder(releases, today);

  if (releases.length === 0) return emptyState ?? null;

  return (
    <div className="h-full overflow-y-auto">
      <ul aria-label={t("tasks:releases.timeline.label")} className="min-w-0">
        {items.map((release) => (
          <ReleaseRow
            key={release.id}
            release={release}
            counts={counts.get(release.id) ?? NO_COUNTS}
            today={today}
            {...rowProps}
          />
        ))}
      </ul>
    </div>
  );
}
