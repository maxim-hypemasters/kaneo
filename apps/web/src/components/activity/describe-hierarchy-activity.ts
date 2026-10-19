type Translate = (key: string, options?: Record<string, unknown>) => string;

const titleOf = (value: unknown, t: Translate) =>
  typeof value === "string" && value ? value : t("tasks:features.unknown");

// "feature_changed" and "type_changed" events, phrased to follow the actor's
// name. null for other events, or without event data.
export function describeHierarchyActivity(
  type: string,
  eventData: Record<string, unknown> | null,
  t: Translate,
): string | null {
  if (!eventData) return null;

  if (type === "feature_changed") {
    const { oldFeatureId, newFeatureId } = eventData;
    const from = titleOf(eventData.oldFeatureTitle, t);
    const to = titleOf(eventData.newFeatureTitle, t);
    if (oldFeatureId && newFeatureId) {
      return t("activity:changedFeature", { from, to });
    }
    if (newFeatureId) return t("activity:addedToFeature", { feature: to });
    if (oldFeatureId) {
      return t("activity:removedFromFeature", { feature: from });
    }
    return null;
  }

  if (type === "type_changed") {
    if (eventData.newType === "feature")
      return t("activity:changedTypeToFeature");
    if (eventData.newType === "task") return t("activity:changedTypeToTask");
    if (eventData.newType === "bug") return t("activity:changedTypeToBug");
  }

  return null;
}
