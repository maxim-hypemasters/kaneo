import { useTranslation } from "react-i18next";
import useGetConfig from "@/hooks/queries/config/use-get-config";
import { useTaskAgent } from "@/hooks/queries/agent/use-task-agent";
import { useWorkspacePermission } from "@/hooks/use-workspace-permission";
import type Task from "@/types/task";
import { AgentRunStatus } from "./agent-run-status";
import { CopyPromptDialog } from "./copy-prompt-dialog";
import { QuestionsCard } from "./questions-card";
import { ReadinessCard } from "./readiness-card";
import { ShipDialog } from "./ship-dialog";
import { StartActions } from "./start-actions";
import { startActionsMode } from "./start-actions-mode";
import { SuggestionsCard } from "./suggestions-card";
import { taskStage } from "./task-stage";
import { useAutoAssess } from "./use-auto-assess";
import { useRefreshOnTaskEdit } from "./use-refresh-on-task-edit";
import { useShipFlow } from "./use-ship-flow";
import { useStartFlow } from "./use-start-flow";

type AiAgentSectionProps = {
  task: Task;
};

// Renders nothing unless the instance has the agent and the task's project
// turned it on; features never go to the agent.
export function AiAgentSection({ task }: AiAgentSectionProps) {
  const { t } = useTranslation();
  const { data: config } = useGetConfig();
  const { canWorkItem, canManageSettings, canAssignTasks, canCreateTestCases } =
    useWorkspacePermission();
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
  const settledAt = Math.max(dataUpdatedAt, errorUpdatedAt);
  const shipFlow = useShipFlow({
    taskId: task.id,
    projectId: task.projectId,
    canShip: canUpdate && agent?.ship.canShip === true,
    activeRunId: agent?.ship.activeRun?.id ?? null,
    settledAt,
  });
  const startFlow = useStartFlow({
    taskId: task.id,
    projectId: task.projectId,
    settledAt,
    sectionRef: shipFlow.sectionRef,
    scoreRef: shipFlow.scoreRef,
    statusRef: shipFlow.statusRef,
  });
  if (!available || !agent?.enabled) return null;

  const stage = taskStage(task.status, agent.workflow);
  const mode = startActionsMode({ stage, canUpdate, agent });
  const { assessment, clarifications } = agent;
  const questions = assessment?.questions ?? [];
  const showQuestions =
    stage !== "other" && (questions.length > 0 || clarifications.length > 0);

  return (
    <section
      ref={shipFlow.sectionRef}
      aria-label={t("tasks:aiAgent.sectionLabel")}
      className="mb-5 flex flex-col gap-2"
    >
      <ReadinessCard
        taskId={task.id}
        agent={agent}
        canUpdate={canUpdate}
        canManageSettings={canManageSettings()}
        scoreRef={shipFlow.scoreRef}
      >
        {mode ? (
          <StartActions
            mode={mode}
            ship={agent.ship}
            starting={startFlow.starting}
            onShip={shipFlow.openDialog}
            onStart={startFlow.start}
            onCopyPrompt={startFlow.copyPrompt}
            onMenuOpenChange={startFlow.setMenuOpen}
          />
        ) : null}
        <AgentRunStatus
          taskId={task.id}
          projectId={task.projectId}
          agent={agent}
          canUpdate={canUpdate}
          statusRef={shipFlow.statusRef}
        />
      </ReadinessCard>
      {showQuestions ? (
        <QuestionsCard
          taskId={task.id}
          questions={questions}
          assessedAt={assessment?.assessedAt ?? null}
          clarifications={clarifications}
          canUpdate={canUpdate}
        />
      ) : null}
      {assessment ? (
        <SuggestionsCard
          taskId={task.id}
          projectId={task.projectId}
          suggestions={assessment.suggestions}
          permissions={{
            canUpdate,
            canAssign: canAssignTasks(),
            canCreateTestCases: canCreateTestCases(),
          }}
          emptyFocusRef={shipFlow.scoreRef}
        />
      ) : null}
      <ShipDialog
        open={shipFlow.open}
        onOpenChange={shipFlow.setOpen}
        ship={agent.ship}
        runnerOnline={agent.runner.online}
        pending={shipFlow.pending}
        onConfirm={shipFlow.confirm}
        finalFocus={shipFlow.finalFocus}
      />
      <CopyPromptDialog
        open={startFlow.dialog.open}
        prompt={startFlow.dialog.prompt}
        onClose={startFlow.dialog.close}
        inProgressName={agent.workflow.inProgress?.name ?? null}
        starting={startFlow.starting}
        onStart={startFlow.dialog.start}
        finalFocus={startFlow.dialog.finalFocus}
      />
    </section>
  );
}
