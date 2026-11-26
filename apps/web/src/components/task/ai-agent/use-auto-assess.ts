import { useEffect, useRef, useState } from "react";
import type { TaskAgent } from "@/fetchers/agent/get-task-agent";
import { useRequestTaskAssessment } from "@/hooks/mutations/agent/use-request-task-assessment";
import { shouldAutoAssess } from "./should-auto-assess";

/**
 * Asks at most once per open task, from the first state fetched after it
 * opened (pass undefined until then): a cached state can be out of date, and
 * later updates follow edits the server already schedules its own, delayed
 * check for. Asking then would start that check early.
 */
export function useAutoAssess(
  taskId: string,
  agent: TaskAgent | undefined,
  canUpdate: boolean,
) {
  const [opened, setOpened] = useState(agent);
  if (opened === undefined && agent !== undefined) setOpened(agent);
  const requested = useRef(false);
  const { mutate } = useRequestTaskAssessment();
  const wanted = opened ? shouldAutoAssess(opened, canUpdate) : false;

  useEffect(() => {
    if (!wanted || requested.current) return;
    requested.current = true;
    mutate(taskId);
  }, [wanted, taskId, mutate]);
}
