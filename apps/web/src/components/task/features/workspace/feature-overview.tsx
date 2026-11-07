import type Task from "@/types/task";
import TaskDescription from "../../task-description";
import { TaskRelatedContent } from "../../task-related-content";
import { FeatureLatestUpdate } from "./feature-latest-update";

export function FeatureOverview({
  feature,
  workspaceId,
  onOpenActivity,
}: {
  feature: Task;
  workspaceId: string;
  onOpenActivity: (updateId?: string) => void;
}) {
  return (
    <div className="flex flex-col gap-7">
      <TaskDescription taskId={feature.id} />
      <FeatureLatestUpdate
        featureId={feature.id}
        projectId={feature.projectId}
        onOpenActivity={onOpenActivity}
      />
      <TaskRelatedContent task={feature} workspaceId={workspaceId} />
    </div>
  );
}
