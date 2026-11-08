type Translate = (key: string, options?: Record<string, unknown>) => string;

export type ActivitySubject = "task" | "feature";

// Bugs share the task wording.
export function activitySubjectOf(
  taskType: string | null | undefined,
): ActivitySubject {
  return taskType === "feature" ? "feature" : "task";
}

const CREATED_TYPES = new Set(["create", "created", "task"]);

// Events whose wording names what they happened to, phrased to follow the
// actor's name. null for other events.
export function describeSubjectActivity(
  type: string,
  eventData: Record<string, unknown> | null,
  subject: ActivitySubject,
  t: Translate,
): string | null {
  const isFeature = subject === "feature";
  if (CREATED_TYPES.has(type)) {
    return isFeature ? t("activity:createdFeature") : t("activity:created");
  }
  if (type === "feature_update") return t("activity:postedFeatureUpdate");
  if (type !== "moved" || !eventData) return null;

  const to = String(eventData.toProjectName ?? "");
  // A project the viewer can't see was redacted to null.
  if (eventData.fromProjectName) {
    const from = String(eventData.fromProjectName);
    return isFeature
      ? t("activity:movedFeature", { from, to })
      : t("activity:moved", { from, to });
  }
  return isFeature
    ? t("activity:movedFeatureFromOtherProject", { to })
    : t("activity:movedFromOtherProject", { to });
}
