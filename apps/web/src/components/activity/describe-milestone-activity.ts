type Translate = (key: string, options?: Record<string, unknown>) => string;
export function describeMilestoneActivity(
  type: string,
  eventData: Record<string, unknown> | null,
  t: Translate,
): string | null {
  if (type !== "milestone_changed" || !eventData) return null;
  if (eventData.newMilestoneId)
    return t("tasks:milestones.activityAssigned", {
      title:
        typeof eventData.newMilestoneTitle === "string" &&
        eventData.newMilestoneTitle
          ? eventData.newMilestoneTitle
          : t("tasks:milestones.unavailable"),
    });
  return t("tasks:milestones.activityCleared");
}
