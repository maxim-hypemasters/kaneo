import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { agentKeys } from "@/hooks/queries/agent/agent-keys";

export type AgentTaskFields = {
  id: string;
  type: string;
  title: string;
  description: string | null;
  status: string | null;
  archivedAt: string | null;
};

/**
 * The assessment's freshness and the Ship blockers follow the task's text,
 * type and archive state, but the server announces only some of those
 * edits, and leaves out the person who made them. The open task refetches
 * on every task update, so its agent state follows.
 */
export function useRefreshOnTaskEdit(task: AgentTaskFields) {
  const queryClient = useQueryClient();
  const { id, type, title, description } = task;
  const archived = task.archivedAt !== null || task.status === "archived";
  const seen = useRef({ type, title, description, archived });

  useEffect(() => {
    const previous = seen.current;
    if (
      previous.type === type &&
      previous.title === title &&
      previous.description === description &&
      previous.archived === archived
    ) {
      return;
    }
    seen.current = { type, title, description, archived };
    void queryClient.invalidateQueries({ queryKey: agentKeys.task(id) });
  }, [queryClient, id, type, title, description, archived]);
}
