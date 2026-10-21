export type FeatureMilestoneDraft = {
  key: string;
  title: string;
  leadId: string | null;
  priority: "no-priority" | "low" | "medium" | "high" | "urgent";
  releaseId: string | null;
};

export type FeatureExistingTaskDraft = {
  id: string;
  title: string;
  type: "task" | "bug";
  number: number | null;
  projectSlug: string;
  releaseId: string | null;
  releaseName: string | null;
  milestoneKey: string | null;
};

export type FeatureNewTaskDraft = {
  key: string;
  title: string;
  type: "task" | "bug";
  milestoneKey: string | null;
};

export type FeatureCompositionDraft = {
  milestones: FeatureMilestoneDraft[];
  existingTasks: FeatureExistingTaskDraft[];
  newTasks: FeatureNewTaskDraft[];
  unassignedReleaseId: string | null;
};
