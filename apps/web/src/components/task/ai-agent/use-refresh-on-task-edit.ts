import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { agentKeys } from "@/hooks/queries/agent/agent-keys";
import type Task from "@/types/task";

/**
 * The assessment's freshness, the Ship and Start blockers, and which
 * suggestions still apply follow the task's text, type, status, archive
 * state, planning fields and dates (an estimate plans dates only for a task
 * without them), but the server announces only some of those edits, and
 * leaves out the person who made them. The open task refetches on every
 * task update, so its agent state follows.
 */
export function useRefreshOnTaskEdit(task: Task) {
  const queryClient = useQueryClient();
  const watched = {
    type: task.type ?? null,
    title: task.title,
    description: task.description,
    status: task.status,
    archived: Boolean(task.archivedAt) || task.status === "archived",
    userId: task.userId,
    priority: task.priority,
    featureId: task.featureId ?? null,
    milestoneId: task.milestoneId ?? null,
    releaseId: task.releaseId ?? null,
    estimateSeconds: task.estimateSeconds ?? null,
    startDate: task.startDate,
    dueDate: task.dueDate,
  };
  const fingerprint = JSON.stringify(watched);
  const seen = useRef(fingerprint);
  const { id } = task;

  useEffect(() => {
    if (seen.current === fingerprint) return;
    seen.current = fingerprint;
    void queryClient.invalidateQueries({ queryKey: agentKeys.task(id) });
  }, [queryClient, id, fingerprint]);
}
