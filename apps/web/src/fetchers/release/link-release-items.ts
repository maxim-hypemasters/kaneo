import { updateMilestone } from "@/fetchers/milestone/milestones";
import updateTaskRelease from "@/fetchers/task/update-task-release";
import type {
  ReleaseLinkCandidate,
  ReleaseLinkKind,
} from "./get-release-link-candidates";

export async function linkReleaseItems(
  releaseId: string,
  kind: ReleaseLinkKind,
  candidates: readonly ReleaseLinkCandidate[],
) {
  const ids = [...new Set(candidates.map(({ id }) => id))];
  const successes = new Set<string>();
  let next = 0;
  async function worker() {
    while (next < ids.length) {
      const id = ids[next++];
      try {
        if (kind === "milestone") await updateMilestone(id, { releaseId });
        else await updateTaskRelease(id, releaseId);
        successes.add(id);
      } catch {
        // Each assignment is independently transactional; retain successes.
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(4, ids.length) }, worker));
  return {
    succeeded: ids.filter((id) => successes.has(id)),
    failed: ids.filter((id) => !successes.has(id)),
  };
}
