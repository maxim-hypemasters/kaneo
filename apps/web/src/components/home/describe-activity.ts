import { describeHierarchyActivity } from "@/components/activity/describe-hierarchy-activity";
import { describeMilestoneActivity } from "@/components/activity/describe-milestone-activity";
import { describeReleaseActivity } from "@/components/activity/describe-release-activity";
import {
  activitySubjectOf,
  describeSubjectActivity,
} from "@/components/activity/describe-subject-activity";
import type { WorkspaceActivity } from "@/fetchers/activity/get-workspace-activities";
import { formatDateMedium } from "@/lib/format";
import { getPriorityLabel, getStatusDisplayLabel } from "@/lib/i18n/domain";

type Translate = (key: string, options?: Record<string, unknown>) => string;

function eventDataOf(activity: WorkspaceActivity) {
  const { eventData } = activity;
  if (!eventData || typeof eventData !== "object" || Array.isArray(eventData)) {
    return null;
  }
  return eventData as Record<string, unknown>;
}

function formatEventDate(value: unknown) {
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? String(value) : formatDateMedium(date);
}

// What the actor did, phrased to follow their name: "Mira <changed status…>".
export function describeActivity(activity: WorkspaceActivity, t: Translate) {
  const eventData = eventDataOf(activity);
  const subject = activitySubjectOf(activity.taskType);

  switch (activity.type) {
    case "comment":
      return t("workspace:home.activity.commented");
    case "unassigned":
      return t("activity:unassigned");
    case "status_changed":
      if (eventData) {
        return t("activity:changedStatus", {
          from: getStatusDisplayLabel(
            String(eventData.oldStatus ?? ""),
            typeof eventData.oldStatusName === "string"
              ? eventData.oldStatusName
              : undefined,
          ),
          to: getStatusDisplayLabel(
            String(eventData.newStatus ?? ""),
            typeof eventData.newStatusName === "string"
              ? eventData.newStatusName
              : undefined,
          ),
        });
      }
      break;
    case "priority_changed":
      if (eventData) {
        return t("activity:changedPriority", {
          from: getPriorityLabel(String(eventData.oldPriority ?? "")),
          to: getPriorityLabel(String(eventData.newPriority ?? "")),
        });
      }
      break;
    case "assignee_changed":
      if (eventData) {
        return eventData.isSelfAssigned
          ? t("activity:assignedToSelf")
          : t("activity:assignedTo", {
              name: String(eventData.newAssignee ?? ""),
            });
      }
      break;
    case "due_date_changed":
      if (eventData) {
        if (!eventData.newDueDate) return t("activity:clearedDueDate");
        return eventData.oldDueDate
          ? t("activity:changedDueDate", {
              from: formatEventDate(eventData.oldDueDate),
              to: formatEventDate(eventData.newDueDate),
            })
          : t("activity:setDueDate", {
              date: formatEventDate(eventData.newDueDate),
            });
      }
      break;
    case "title_changed":
      if (eventData) {
        return t("activity:changedTitle", {
          from: String(eventData.oldTitle ?? ""),
          to: String(eventData.newTitle ?? ""),
        });
      }
      break;
    default: {
      const description =
        describeSubjectActivity(activity.type, eventData, subject, t) ??
        describeHierarchyActivity(activity.type, eventData, t) ??
        describeMilestoneActivity(activity.type, eventData, t) ??
        describeReleaseActivity(activity.type, eventData, t);
      if (description) return description;
      break;
    }
  }

  // Events recorded before eventData existed only have their English text.
  return (
    activity.excerpt ||
    (subject === "feature"
      ? t("workspace:home.activity.updatedFeature")
      : t("workspace:home.activity.updated"))
  );
}
