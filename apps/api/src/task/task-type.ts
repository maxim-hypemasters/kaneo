export const TASK_TYPES = ["task", "bug", "feature"] as const;

export type TaskType = (typeof TASK_TYPES)[number];
