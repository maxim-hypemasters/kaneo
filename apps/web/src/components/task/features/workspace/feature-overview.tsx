import type Task from "@/types/task";
import TaskDescription from "../../task-description";
import { TaskResources } from "../../task-resources";
import { FeatureLatestUpdate } from "./feature-latest-update";

export function FeatureOverview({
  feature,
  onOpenActivity,
}: {
  feature: Task;
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
      <TaskResources taskId={feature.id} />
    </div>
  );
}
