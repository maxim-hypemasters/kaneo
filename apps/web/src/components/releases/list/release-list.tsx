import { useState } from "react";
import { useTranslation } from "react-i18next";
import { EMPTY_RELEASE_PROGRESS } from "@/lib/releases/upsert-release";
import { sortReleases } from "@/lib/releases/sort-releases";
import type { ReleaseItemCounts } from "@/lib/releases/release-progress";
import type { Release } from "@/types/release";
import { countsFromProgress } from "../release-counts";
import type { ReleasePermissions } from "../use-release-permissions";
import { ReleaseListSection } from "./release-list-section";
import { ReleaseRow } from "./release-row";

type ReleaseListProps = {
  releases: readonly Release[];
  counts: ReadonlyMap<string, ReleaseItemCounts>;
  today: string;
  workspaceId: string;
  permissions: ReleasePermissions;
  onEdit: (release: Release) => void;
  onDelete: (release: Release) => void;
  onMoveUnfinished: (release: Release) => void;
};

const NO_COUNTS = countsFromProgress(EMPTY_RELEASE_PROGRESS);

const SECTIONS = [
  { id: "active", titleKey: "tasks:releases.sections.active" },
  { id: "upcoming", titleKey: "tasks:releases.sections.upcoming" },
  { id: "past", titleKey: "tasks:releases.sections.past" },
] as const;

// Active, upcoming, then past releases. Past ones start collapsed while
// there's anything current to look at.
export function ReleaseList({
  releases,
  counts,
  today,
  ...rowProps
}: ReleaseListProps) {
  const { t } = useTranslation();
  const sections = sortReleases(releases, today);
  const hasCurrent = sections.active.length + sections.upcoming.length > 0;
  const [pastOpen, setPastOpen] = useState(false);

  return (
    <div className="h-full overflow-y-auto">
      {SECTIONS.map(({ id, titleKey }) => {
        const items = sections[id];
        if (items.length === 0) return null;
        const collapsible = id === "past" && hasCurrent;
        return (
          <ReleaseListSection
            key={id}
            title={t(titleKey)}
            count={items.length}
            open={collapsible ? pastOpen : true}
            onOpenChange={collapsible ? setPastOpen : undefined}
          >
            {items.map((release) => (
              <ReleaseRow
                key={release.id}
                release={release}
                counts={counts.get(release.id) ?? NO_COUNTS}
                today={today}
                {...rowProps}
              />
            ))}
          </ReleaseListSection>
        );
      })}
    </div>
  );
}
