import type { MilestoneWithFeature } from "@/fetchers/milestone/milestones";
import type { Release } from "@/types/release";

function compareText(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function groupMasterplanningMilestones(
  releases: readonly Pick<Release, "id">[],
  milestones: readonly MilestoneWithFeature[],
) {
  const groups = new Map<string | null, MilestoneWithFeature[]>(
    releases.map(({ id }) => [id, []]),
  );
  groups.set(null, []);
  const unresolved: MilestoneWithFeature[] = [];
  const ordered = [...milestones].sort(
    (left, right) =>
      compareText(left.featureTitle, right.featureTitle) ||
      compareText(left.featureId, right.featureId) ||
      left.position - right.position ||
      compareText(left.id, right.id),
  );
  for (const milestone of ordered) {
    const group = groups.get(milestone.releaseId);
    if (group) group.push(milestone);
    else unresolved.push(milestone);
  }
  return { groups, unresolved };
}
