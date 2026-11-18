type MilestoneOption = {
  id: string;
  title: string;
  featureId: string;
  featureTitle: string;
};

export function groupMilestonesByFeature<T extends MilestoneOption>(
  milestones: readonly T[],
) {
  const groups = new Map<
    string,
    { featureId: string; featureTitle: string; milestones: T[] }
  >();
  for (const milestone of milestones) {
    const group = groups.get(milestone.featureId) ?? {
      featureId: milestone.featureId,
      featureTitle: milestone.featureTitle,
      milestones: [],
    };
    group.milestones.push(milestone);
    groups.set(milestone.featureId, group);
  }
  return [...groups.values()];
}
