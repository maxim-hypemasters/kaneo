import { Link } from "@tanstack/react-router";
import { Diamond, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import CreateTaskModal from "@/components/shared/modals/create-task-modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Milestone } from "@/fetchers/milestone/milestones";
import { useMilestoneMutations } from "@/hooks/mutations/milestone/use-milestone-mutations";
import { useFeatureIndex } from "@/hooks/queries/task/use-feature-index";
import { useWorkspacePermission } from "@/hooks/use-workspace-permission";
import { toast } from "@/lib/toast";
import { useMilestoneDetailsStore } from "@/store/milestone-details";
import { useFeatureTasks } from "../features/use-feature-tasks";
import { MilestonePlanningFields } from "./milestone-planning-fields";
export function MilestoneDetails({
  milestone,
  projectId,
  workspaceId,
}: {
  milestone: Milestone;
  projectId: string;
  workspaceId: string;
}) {
  const { t } = useTranslation();
  const [title, setTitle] = useState(milestone.title);
  const [creating, setCreating] = useState(false);
  const { close } = useMilestoneDetailsStore();
  const { canUpdateTasks, canCreateTasks } = useWorkspacePermission();
  const feature = useFeatureIndex(projectId).features.get(milestone.featureId);
  const tasks = useFeatureTasks(milestone.featureId, projectId);
  const linked = tasks.tasks.filter(
    (item) => item.task.milestoneId === milestone.id,
  );
  const mutations = useMilestoneMutations(projectId, milestone.featureId);
  useEffect(() => setTitle(milestone.title), [milestone.title]);
  const progress = milestone.progress;
  const percentage = progress.total
    ? Math.round((progress.completed / progress.total) * 100)
    : 0;
  return (
    <div className="flex flex-col gap-6">
      <div className="space-y-2">
        <Link
          className="text-sm text-muted-foreground hover:text-foreground"
          to="/dashboard/workspace/$workspaceId/project/$projectId/task/$taskId"
          params={{ workspaceId, projectId, taskId: milestone.featureId }}
          onClick={close}
        >
          {feature?.title ?? t("tasks:features.property")}
        </Link>
        <Input
          aria-label={t("tasks:milestones.titleLabel")}
          value={title}
          disabled={!canUpdateTasks() || mutations.update.isPending}
          maxLength={255}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => {
            if (!title.trim()) {
              setTitle(milestone.title);
              toast.error(t("tasks:milestones.titleRequired"));
              return;
            }
            if (title.trim() !== milestone.title)
              mutations.update.mutate(
                { id: milestone.id, title: title.trim() },
                {
                  onError: () => {
                    setTitle(milestone.title);
                    toast.error(t("tasks:milestones.saveError"));
                  },
                },
              );
          }}
        />
      </div>
      <MilestonePlanningFields
        projectId={projectId}
        workspaceId={workspaceId}
        milestone={milestone}
        pending={mutations.update.isPending}
        onChange={(input) =>
          mutations.update.mutate(
            { id: milestone.id, ...input },
            { onError: () => toast.error(t("tasks:milestones.saveError")) },
          )
        }
      />
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Diamond className="size-4" />
          <h2 className="font-medium">{t("tasks:milestones.workProgress")}</h2>
          <span
            className="ml-auto text-sm tabular-nums"
            aria-label={t("tasks:milestones.progress", progress)}
          >
            {percentage}% · {progress.completed}/{progress.total}
          </span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full bg-primary"
            style={{ width: `${percentage}%` }}
          />
        </div>
      </section>
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="font-medium">{t("tasks:title")}</h2>
          {canCreateTasks() && canUpdateTasks() && (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={t("tasks:milestones.addLinkedWork")}
              onClick={() => setCreating(true)}
            >
              <Plus />
            </Button>
          )}
        </div>
        {tasks.isError ? (
          <div role="alert">
            <p>{t("common:error.title")}</p>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void tasks.refetch()}
            >
              {t("common:error.tryAgain")}
            </Button>
          </div>
        ) : !tasks.ready ? (
          <p role="status">{t("common:empty.loading")}</p>
        ) : linked.length ? (
          linked.map(({ task, isCompleted }) => (
            <Link
              key={task.id}
              className="block rounded-md px-2 py-2 text-sm hover:bg-accent"
              to="/dashboard/workspace/$workspaceId/project/$projectId/task/$taskId"
              params={{ workspaceId, projectId, taskId: task.id }}
              onClick={close}
            >
              <span
                className={
                  isCompleted ? "text-muted-foreground line-through" : ""
                }
              >
                {task.title}
              </span>
            </Link>
          ))
        ) : (
          <p className="px-2 text-sm text-muted-foreground">
            {t("tasks:milestones.noLinkedWork")}
          </p>
        )}
      </section>
      {creating && (
        <CreateTaskModal
          open
          projectId={projectId}
          initialFeature={{
            id: milestone.featureId,
            title: feature?.title ?? t("tasks:features.property"),
          }}
          initialMilestoneId={milestone.id}
          onClose={() => setCreating(false)}
        />
      )}
    </div>
  );
}
