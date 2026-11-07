import type {
  FeatureUpdateData,
  FeatureMilestoneSnapshot,
} from "@/fetchers/feature/types";

export function featureUpdateData(value: unknown): FeatureUpdateData | null {
  if (
    !value ||
    typeof value !== "object" ||
    !("health" in value) ||
    !("milestones" in value)
  )
    return null;
  if (
    !["on-track", "at-risk", "off-track"].includes(String(value.health)) ||
    !Array.isArray(value.milestones)
  )
    return null;
  const milestones = value.milestones.filter(
    (item): item is FeatureMilestoneSnapshot =>
      Boolean(item) &&
      typeof item === "object" &&
      typeof item.id === "string" &&
      typeof item.title === "string" &&
      [item.position, item.total, item.started, item.completed].every(
        (count) => typeof count === "number",
      ) &&
      (item.previousTotal === null || typeof item.previousTotal === "number") &&
      (item.previousCompleted === null ||
        typeof item.previousCompleted === "number"),
  );
  return { health: value.health as FeatureUpdateData["health"], milestones };
}

export function milestoneSnapshotPercent(completed: number, total: number) {
  return total > 0 ? Math.round((completed / total) * 100) : 0;
}
