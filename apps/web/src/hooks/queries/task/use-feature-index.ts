import { useMemo } from "react";
import { getFeatureIndex } from "@/lib/features/feature-index";
import { useCachedBoard } from "./use-cached-board";
import { useGetProjectFeatures } from "./use-get-project-features";
const identity = <T>(value: T) => value;
export function useFeatureIndex(projectId: string | undefined) {
  const board = useCachedBoard(projectId, identity);
  const { data: features } = useGetProjectFeatures(projectId);
  return useMemo(() => getFeatureIndex(board, features), [board, features]);
}
