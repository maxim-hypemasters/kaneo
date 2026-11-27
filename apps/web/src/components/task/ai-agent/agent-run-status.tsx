import type { RefObject } from "react";
import { useTranslation } from "react-i18next";
import type { TaskAgent } from "@/fetchers/agent/get-task-agent";
import { ActiveRun } from "./active-run";
import { FinishedRun } from "./finished-run";
import { runAnnouncement } from "./run-announcement";

type AgentRunStatusProps = {
  taskId: string;
  projectId: string;
  agent: TaskAgent;
  canUpdate: boolean;
  statusRef: RefObject<HTMLParagraphElement | null>;
};

export function AgentRunStatus({
  taskId,
  projectId,
  agent,
  canUpdate,
  statusRef,
}: AgentRunStatusProps) {
  const { t } = useTranslation();
  const { activeRun, lastRun, events } = agent.ship;
  const announcement = runAnnouncement(agent.ship);

  return (
    <>
      {/* Always mounted, so screen readers hear each change of its text. */}
      <p role="status" className="sr-only">
        {announcement === null
          ? null
          : "key" in announcement
            ? t(announcement.key)
            : announcement.text}
      </p>
      {activeRun ? (
        <ActiveRun
          taskId={taskId}
          projectId={projectId}
          run={activeRun}
          events={events}
          runner={agent.runner}
          canUpdate={canUpdate}
          statusRef={statusRef}
        />
      ) : lastRun ? (
        <FinishedRun run={lastRun} events={events} />
      ) : null}
    </>
  );
}
