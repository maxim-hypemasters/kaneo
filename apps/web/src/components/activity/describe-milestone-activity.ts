type Translate = (key: string, options?: Record<string, unknown>) => string;
export function describeMilestoneActivity(
  type: string,
  eventData: Record<string, unknown> | null,
  t: Translate,
): string | null {
  if (type === "feature_archived")
    return t("tasks:features.library.activityArchived");
  if (type === "feature_unarchived")
    return t("tasks:features.library.activityRestored");
  if (!eventData) return null;
  const milestoneTitle = String(
    eventData.milestoneTitle ??
      eventData.title ??
      t("tasks:milestones.unavailable"),
  );
  const planningEvents: Record<string, string> = {
    milestone_created: "tasks:milestones.activityCreated",
    milestone_updated: "tasks:milestones.activityUpdated",
    milestone_deleted: "tasks:milestones.activityDeleted",
    milestone_completed: "tasks:milestones.activityCompleted",
    milestone_reopened: "tasks:milestones.activityReopened",
  };
  const labels: Record<string, string> = {
    leadId: t("tasks:milestones.lead"),
    userId: t("tasks:assignee.label"),
    status: t("tasks:status.label"),
    priority: t("tasks:priority.label"),
    releaseId: t("tasks:releases.property"),
    startDate: t("tasks:milestones.startDate"),
    endDate: t("tasks:milestones.endDate"),
    dueDate: t("tasks:milestones.endDate"),
  };
  if (
    type === "milestone_updated" &&
    eventData.changes &&
    typeof eventData.changes === "object"
  ) {
    const fields = Object.keys(eventData.changes)
      .map((key) => labels[key])
      .filter(Boolean);
    if (fields.length)
      return t("tasks:milestones.activityUpdatedFields", {
        title: milestoneTitle,
        fields: fields.join(", "),
      });
  }
  if (planningEvents[type])
    return t(planningEvents[type], { title: milestoneTitle });
  if (type === "feature_planning_snapshot")
    return t("tasks:milestones.planningSnapshot", {
      values: [
        "status",
        "priority",
        "userId",
        "startDate",
        "dueDate",
        "releaseId",
      ]
        .map((key) => {
          const value =
            key === "releaseId"
              ? (eventData.releaseName ?? eventData.releaseId)
              : eventData[key];
          return typeof value === "string" && value
            ? `${labels[key]}: ${value}`
            : null;
        })
        .filter(Boolean)
        .join(" · "),
    });
  if (type !== "milestone_changed") return null;
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
