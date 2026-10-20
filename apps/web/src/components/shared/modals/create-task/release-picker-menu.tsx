import { useTranslation } from "react-i18next";
import { OptionMenu } from "@/components/common/option-menu/option-menu";
import { releaseMenuOptions } from "@/components/task/menus/release-menu-options";
import { useGetReleases } from "@/hooks/queries/release/use-get-releases";
import { formatReleaseRange } from "@/lib/releases/release-date";
import { useReleaseToday } from "@/lib/releases/use-release-today";

type ReleasePickerMenuProps = {
  projectId: string;
  // The release the new task would be in, or null for none.
  selectedId: string | null;
  // The chosen feature's release, marked in the list.
  featureReleaseId: string | null;
  onSelect: (releaseId: string | null) => void;
};

export function ReleasePickerMenu({
  projectId,
  selectedId,
  featureReleaseId,
  onSelect,
}: ReleasePickerMenuProps) {
  const { t } = useTranslation();
  const today = useReleaseToday();
  const { data: releases, isPending } = useGetReleases(projectId);
  const options = releaseMenuOptions(releases ?? [], selectedId, {
    today,
    featureReleaseId,
    labels: {
      none: t("common:modals.createTask.noRelease"),
      unknown: t("tasks:releases.unknown"),
      featureRelease: t("tasks:releases.milestoneReleaseHint"),
    },
    rangeOf: (release) =>
      formatReleaseRange(release.startDate, release.submissionDate, { today }),
  });
  // Without releases (they failed to load), "No release" can still be picked.
  const notice = isPending
    ? null
    : releases === undefined
      ? t("common:modals.createTask.loadReleasesError")
      : releases.length === 0
        ? t("common:modals.createTask.noReleasesFound")
        : null;

  return (
    <>
      <OptionMenu
        label={t("common:modals.createTask.release")}
        placeholder={t("common:modals.createTask.searchReleases")}
        options={options}
        // Release names often start with a digit ("2.4").
        numberShortcuts={false}
        onSelect={(value) => onSelect(value || null)}
        status={
          isPending ? t("common:modals.createTask.loadingReleases") : undefined
        }
      />
      <p
        role="status"
        className="px-3 pb-3 text-muted-foreground text-xs empty:hidden"
      >
        {notice}
      </p>
    </>
  );
}
