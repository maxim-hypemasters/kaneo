import type Task from "@/types/task";

// Triage reads like an inbox: the latest report on top.
export function newestFirst(tasks: readonly Task[]) {
  return [...tasks].sort(
    (left, right) =>
      Date.parse(right.createdAt) - Date.parse(left.createdAt) ||
      right.id.localeCompare(left.id),
  );
}
