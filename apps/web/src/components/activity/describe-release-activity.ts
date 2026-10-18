type Translate = (key: string, options?: Record<string, unknown>) => string;

// Names are stored when the change is made; a viewer who can't see the
// release's project gets them nulled.
const nameOf = (value: unknown, t: Translate) =>
  typeof value === "string" && value ? value : t("tasks:releases.unknown");

// A "release_changed" event, phrased to follow the actor's name. null for
// other events, or without event data.
export function describeReleaseActivity(
  type: string,
  eventData: Record<string, unknown> | null,
  t: Translate,
): string | null {
  if (type !== "release_changed" || !eventData) return null;

  const { oldReleaseId, newReleaseId } = eventData;
  const from = nameOf(eventData.oldReleaseName, t);
  const to = nameOf(eventData.newReleaseName, t);
  if (oldReleaseId && newReleaseId) {
    return t("activity:changedRelease", { from, to });
  }
  if (newReleaseId) return t("activity:addedToRelease", { release: to });
  if (oldReleaseId) {
    return t("activity:removedFromRelease", { release: from });
  }
  return null;
}
