import { type ReactNode, useLayoutEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { EMPTY_RELEASE_PROGRESS } from "@/lib/releases/upsert-release";
import type { ReleaseItemCounts } from "@/lib/releases/release-progress";
import { releasePhase } from "@/lib/releases/release-phase";
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
  const viewportRef = useRef<HTMLDivElement>(null);
  const activeRowRef = useRef<HTMLLIElement>(null);
  const positionedRef = useRef(false);
  const firstActiveId = items.find((release) => {
    const phase = releasePhase(release, today);
    return phase === "inProgress" || phase === "codeFreeze";
  })?.id;

  useLayoutEffect(() => {
    if (positionedRef.current) return;
    positionedRef.current = true;
    const viewport = viewportRef.current;
    const row = activeRowRef.current;
    if (!viewport || !row) return;

    viewport.scrollTo({
      top:
        viewport.scrollTop +
        row.getBoundingClientRect().top -
        viewport.getBoundingClientRect().top,
      behavior: "instant",
    });
  }, [firstActiveId]);

  if (releases.length === 0) return emptyState ?? null;

  return (
    <div ref={viewportRef} className="h-full overflow-y-auto">
      <ul aria-label={t("tasks:releases.timeline.label")} className="min-w-0">
        {items.map((release) => (
          <ReleaseRow
            key={release.id}
            ref={release.id === firstActiveId ? activeRowRef : undefined}
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
