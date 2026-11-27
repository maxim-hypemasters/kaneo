import type { QueryClient } from "@tanstack/react-query";
import type { AppliedSuggestion } from "@/fetchers/agent/apply-task-agent-suggestion";
import { agentKeys } from "@/hooks/queries/agent/agent-keys";
import { milestonesKey } from "@/hooks/queries/milestone/use-get-milestones";
import { releaseProgressKey } from "@/hooks/queries/release/use-get-release-progress";
import { releasesKey } from "@/hooks/queries/release/use-get-releases";
import { testCasesKey } from "@/hooks/queries/test-case/test-case-keys";
import { invalidateFeatureChange } from "@/lib/invalidate-feature-change";
import { invalidateMyWork } from "@/lib/invalidate-my-work";
import { invalidateReleaseChange } from "@/lib/invalidate-release-change";

type Target = { taskId: string; projectId?: string };

/**
 * Refreshes what an applied suggestion changed. Without `result` the apply
 * failed; it still refreshes the board, since an estimate may have assigned
 * someone before its dates were refused. The window that applied gets no
 * websocket message for its own edits.
 */
export function invalidateAppliedSuggestion(
  queryClient: QueryClient,
  { taskId, projectId }: Target,
  result: AppliedSuggestion | undefined,
) {
  const refresh = (queryKey: readonly unknown[]) =>
    void queryClient.invalidateQueries({ queryKey });

  refresh(agentKeys.task(taskId));
  refresh(["task", taskId]);
  refresh(["activities", taskId]);
  // A description shows only on the task itself.
  if (!projectId || result?.kind === "description") return;

  invalidateMyWork(queryClient);
  refresh(["tasks", projectId]);
  refresh(testCasesKey(projectId));
  refresh(milestonesKey(projectId));
  if (result?.kind === "assignee" || result?.assigneeChanged) {
    refresh(["notifications"]);
    refresh(["projects"]);
    refresh(["task-relations"]);
  }
  if (result?.kind === "feature" || result?.kind === "milestone")
    invalidateFeatureChange(queryClient, projectId, [taskId]);
  if (result?.kind === "release")
    invalidateReleaseChange(queryClient, projectId, [taskId], {
      board: false,
    });
  // The schedule, Gantt, release plans and progress read the task's
  // estimate and dates.
  if (result?.kind === "estimate" || result?.datesChanged) {
    refresh(["project-schedule", projectId]);
    refresh(releasesKey(projectId));
    refresh(releaseProgressKey(projectId));
  }
}
