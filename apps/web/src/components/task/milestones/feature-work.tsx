import { useEffect } from "react";
import { useGetMilestones } from "@/hooks/queries/milestone/use-get-milestones";
import TaskSubtasks from "../task-subtasks";
import { FeatureMilestoneOverview } from "./feature-milestone-overview";
import { useMilestoneSelection } from "./milestone-selection-context";
export function FeatureWork({
  featureId,
  projectId,
  workspaceId,
  featureStatus,
  featureReleaseId,
}: {
  featureId: string;
  projectId: string;
  workspaceId: string;
  featureStatus: string;
  featureReleaseId?: string | null;
}) {
  const { filter, setFilter } = useMilestoneSelection();
  const { data, isSuccess } = useGetMilestones(projectId, featureId);
  useEffect(() => {
    if (
      typeof filter === "object" &&
      isSuccess &&
      !data.some((m) => m.id === filter.id)
    )
      setFilter("all");
  }, [data, filter, isSuccess, setFilter]);
  return (
    <>
      <FeatureMilestoneOverview
        projectId={projectId}
        featureId={featureId}
        placement="inline"
      />
      <TaskSubtasks
        key={JSON.stringify([featureId, filter])}
        featureId={featureId}
        projectId={projectId}
        workspaceId={workspaceId}
        featureStatus={featureStatus}
        featureReleaseId={featureReleaseId}
        milestoneFilter={filter}
      />
    </>
  );
}
