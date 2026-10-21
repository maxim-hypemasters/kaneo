import type { MilestoneTaskDraft } from "@/fetchers/milestone/milestones";

export type MilestoneDraftTask = MilestoneTaskDraft & {
  id: string;
};

export const MAX_MILESTONE_DRAFT_TASKS = 100;
