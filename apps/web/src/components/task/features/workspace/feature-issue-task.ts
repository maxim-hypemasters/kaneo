import type { FeatureIssue } from "@/fetchers/feature/get-feature-issues";
import type Task from "@/types/task";

export type FeatureIssueTask = Task & { projectSlug: string };

export function featureIssueTask(issue: FeatureIssue): FeatureIssueTask {
  return {
    ...issue,
    description: null,
    descriptionDeferred: true,
    assigneeId: issue.userId,
    assigneeName: issue.assignee?.name ?? null,
    assigneeImage: issue.assignee?.image ?? null,
  };
}
