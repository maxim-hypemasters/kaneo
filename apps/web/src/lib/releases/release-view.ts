export const RELEASE_VIEWS = ["overview", "masterplanning"] as const;
export type ReleaseView = (typeof RELEASE_VIEWS)[number];

export function isReleaseView(value: unknown): value is ReleaseView {
  return RELEASE_VIEWS.some((view) => view === value);
}
