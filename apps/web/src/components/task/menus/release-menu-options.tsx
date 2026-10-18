import { CircleSlash2, Rocket } from "lucide-react";
import type { OptionMenuItem } from "@/components/common/option-menu/option-menu-item";
import { sortReleases } from "@/lib/releases/sort-releases";
import type { ReleaseDates } from "@/types/release";

type ReleaseOption = ReleaseDates & { id: string; name: string };

// "No release" first (kept while searching), then the active, upcoming and
// past releases, each with its dates; the feature's release says so instead.
// A current release the list lacks shows as unknown.
export function releaseMenuOptions<R extends ReleaseOption>(
  releases: readonly R[],
  current: string | null,
  {
    today,
    featureReleaseId = null,
    labels,
    rangeOf,
  }: {
    today: string;
    featureReleaseId?: string | null;
    labels: { none: string; unknown: string; featureRelease: string };
    rangeOf: (release: R) => string;
  },
): OptionMenuItem[] {
  const { active, upcoming, past } = sortReleases(releases, today);
  const missing =
    current !== null && !releases.some(({ id }) => id === current);

  return [
    {
      value: "",
      label: labels.none,
      icon: <CircleSlash2 className="text-muted-foreground" />,
      selected: current === null,
      pinned: true,
    },
    ...(missing
      ? [
          {
            value: current,
            label: labels.unknown,
            icon: <Rocket className="text-muted-foreground" />,
            selected: true,
          },
        ]
      : []),
    ...[...active, ...upcoming, ...past].map((release) => ({
      value: release.id,
      label: release.name,
      hint:
        release.id === featureReleaseId
          ? labels.featureRelease
          : rangeOf(release),
      icon: <Rocket className="text-muted-foreground" />,
      selected: release.id === current,
    })),
  ];
}
