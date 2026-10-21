import type { FeatureCompositionDraft } from "./types";

export const MAX_FEATURE_COMPOSITION_ITEMS = 100;

export function emptyFeatureComposition(
  releaseId: string | null = null,
): FeatureCompositionDraft {
  return {
    milestones: [],
    existingTasks: [],
    newTasks: [],
    unassignedReleaseId: releaseId,
  };
}

export function hasFeatureCompositionChanges(
  draft: FeatureCompositionDraft,
  initialReleaseId: string | null = null,
) {
  return Boolean(
    draft.milestones.length ||
    draft.existingTasks.length ||
    draft.newTasks.length ||
    draft.unassignedReleaseId !== initialReleaseId,
  );
}

export function validFeatureComposition(draft: FeatureCompositionDraft) {
  const keys = new Set(draft.milestones.map((milestone) => milestone.key));
  return (
    draft.milestones.length <= MAX_FEATURE_COMPOSITION_ITEMS &&
    draft.existingTasks.length <= MAX_FEATURE_COMPOSITION_ITEMS &&
    draft.newTasks.length <= MAX_FEATURE_COMPOSITION_ITEMS &&
    keys.size === draft.milestones.length &&
    draft.milestones.every(
      ({ key, title }) =>
        key && title.trim().length > 0 && title.trim().length <= 255,
    ) &&
    new Set(draft.existingTasks.map((task) => task.id)).size ===
      draft.existingTasks.length &&
    draft.newTasks.every(
      ({ title, milestoneKey }) =>
        title.trim().length > 0 &&
        milestoneKey !== null &&
        keys.has(milestoneKey),
    ) &&
    [...draft.existingTasks, ...draft.newTasks].every(
      ({ milestoneKey }) => milestoneKey === null || keys.has(milestoneKey),
    )
  );
}

export function featureCompositionInput(draft: FeatureCompositionDraft) {
  return {
    milestones: draft.milestones.map((milestone) => ({
      ...milestone,
      title: milestone.title.trim(),
    })),
    existingTasks: draft.existingTasks.map(({ id, milestoneKey }) => ({
      id,
      milestoneKey,
    })),
    newTasks: draft.newTasks.map(({ title, type, milestoneKey }) => ({
      title: title.trim(),
      type,
      milestoneKey,
    })),
    ...(draft.newTasks.some((task) => task.milestoneKey === null)
      ? { unassignedReleaseId: draft.unassignedReleaseId }
      : {}),
  };
}

export function removeFeatureMilestone(
  draft: FeatureCompositionDraft,
  key: string,
): FeatureCompositionDraft {
  return {
    ...draft,
    milestones: draft.milestones.filter((milestone) => milestone.key !== key),
    existingTasks: draft.existingTasks.map((task) =>
      task.milestoneKey === key ? { ...task, milestoneKey: null } : task,
    ),
    newTasks: draft.newTasks.filter((task) => task.milestoneKey !== key),
  };
}
