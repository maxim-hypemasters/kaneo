import { getFeatureIndex } from "@/lib/features/feature-index";
import { useCachedBoard } from "./use-cached-board";

// The project's features, from whatever board is already cached (nothing is
// fetched). getFeatureIndex returns the same index until the board changes.
export function useFeatureIndex(projectId: string | undefined) {
  return useCachedBoard(projectId, getFeatureIndex);
}
