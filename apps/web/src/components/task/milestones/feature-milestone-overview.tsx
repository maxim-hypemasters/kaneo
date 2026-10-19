import { useTaskRailVisible } from "../properties/use-task-rail-visible";
import { FeatureMilestones } from "./feature-milestones";
import { useMilestoneSelection } from "./milestone-selection-context";
export function FeatureMilestoneOverview({
  projectId,
  featureId,
  placement,
}: {
  projectId: string;
  featureId: string;
  placement: "rail" | "inline";
}) {
  const railVisible = useTaskRailVisible();
  const { filter, setFilter } = useMilestoneSelection();
  if (railVisible !== (placement === "rail")) return null;
  return (
    <FeatureMilestones
      projectId={projectId}
      featureId={featureId}
      filter={filter}
      onFilter={setFilter}
    />
  );
}
