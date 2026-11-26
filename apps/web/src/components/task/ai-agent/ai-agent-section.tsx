import { useId } from "react";
import { useTranslation } from "react-i18next";
import useGetConfig from "@/hooks/queries/config/use-get-config";
import { useTaskAgent } from "@/hooks/queries/agent/use-task-agent";
import { useWorkspacePermission } from "@/hooks/use-workspace-permission";
import { AgentRunStatus } from "./agent-run-status";
import { ClarifyPanel } from "./clarify-panel";
import { ReadinessBar } from "./readiness-bar";
import { ShipDialog } from "./ship-dialog";
import { useAutoAssess } from "./use-auto-assess";
import { useClarifyPanel } from "./use-clarify-panel";
import {
  type AgentTaskFields,
  useRefreshOnTaskEdit,
} from "./use-refresh-on-task-edit";
import { useShipFlow } from "./use-ship-flow";

type AiAgentSectionProps = {
  task: AgentTaskFields;
};

// Renders nothing unless the instance has the agent and the task's project
// turned it on; features never go to the agent.
export function AiAgentSection({ task }: AiAgentSectionProps) {
  const { t } = useTranslation();
  const panelId = useId();
  const { data: config } = useGetConfig();
  const { canWorkItem, canManageSettings } = useWorkspacePermission();
  const canUpdate = canWorkItem(task.type, "update");
  const available = config?.hasAiAgent === true && task.type !== "feature";
  const {
    data: agent,
    isFetchedAfterMount,
    isError,
    dataUpdatedAt,
    errorUpdatedAt,
  } = useTaskAgent(task.id, { enabled: available });
  useRefreshOnTaskEdit(task);
  // A failed refetch counts as fetched but leaves the cached, maybe outdated
  // state in place.
  useAutoAssess(
    task.id,
    available && isFetchedAfterMount && !isError ? agent : undefined,
    canUpdate,
  );
  const panel = useClarifyPanel(agent?.assessment);
  const shipFlow = useShipFlow({
    taskId: task.id,
    canShip: canUpdate && agent?.ship.canShip === true,
    activeRunId: agent?.ship.activeRun?.id ?? null,
    settledAt: Math.max(dataUpdatedAt, errorUpdatedAt),
  });

  if (!available || !agent?.enabled) return null;

  return (
    <section
      ref={shipFlow.sectionRef}
      aria-label={t("tasks:aiAgent.sectionLabel")}
      className="mb-5 rounded-lg border border-border bg-muted/40"
    >
      <ReadinessBar
        taskId={task.id}
        agent={agent}
        canUpdate={canUpdate}
        canManageSettings={canManageSettings()}
        panelId={panelId}
        panelOpen={panel.open}
        onTogglePanel={panel.toggle}
        onShip={shipFlow.openDialog}
        summaryRef={shipFlow.summaryRef}
      />
      {panel.open ? (
        <ClarifyPanel
          id={panelId}
          taskId={task.id}
          agent={agent}
          canUpdate={canUpdate}
        />
      ) : null}
      <AgentRunStatus
        taskId={task.id}
        agent={agent}
        canUpdate={canUpdate}
        statusRef={shipFlow.statusRef}
      />
      <ShipDialog
        open={shipFlow.open}
        onOpenChange={shipFlow.setOpen}
        ship={agent.ship}
        runnerOnline={agent.runner.online}
        pending={shipFlow.pending}
        onConfirm={shipFlow.confirm}
        finalFocus={shipFlow.finalFocus}
      />
    </section>
  );
}
