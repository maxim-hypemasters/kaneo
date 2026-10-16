import { useNavigate } from "@tanstack/react-router";
import { getFeatureIndex } from "@/lib/features/feature-index";
import { FeatureChip } from "./feature-chip";
import { useCachedBoard } from "@/hooks/queries/task/use-cached-board";

type BoardFeatureChipProps = {
  projectId: string;
  featureId: string;
  className?: string;
};

// The feature of a card or row, looked up on the cached board; re-renders only
// when that feature changes.
export function BoardFeatureChip({
  projectId,
  featureId,
  className,
}: BoardFeatureChipProps) {
  const navigate = useNavigate();
  const feature = useCachedBoard(projectId, (board) =>
    getFeatureIndex(board).features.get(featureId),
  );

  return (
    <FeatureChip
      feature={feature}
      className={className}
      onOpen={(id) => navigate({ to: ".", search: { taskId: id } })}
    />
  );
}
