import type { TaskType } from "@/types/task";

export const TASK_TYPE_LABELS = {
  task: "tasks:features.typeTask",
  feature: "tasks:features.typeFeature",
  bug: "tasks:features.typeBug",
} as const;

export const TASK_TYPE_CONVERSIONS = {
  task: "tasks:features.convertToTask",
  feature: "tasks:features.convertToFeature",
  bug: "tasks:features.convertToBug",
} as const;

export function normalizeTaskTypes(value: unknown): TaskType[] | null {
  if (!Array.isArray(value)) return null;
  const types = value.filter(
    (type): type is TaskType =>
      type === "task" || type === "feature" || type === "bug",
  );
  return types.length ? [...new Set(types)] : null;
}
