import type { TaskType } from "../task/task-type";

export type ChatSubject = {
  noun: "task" | "feature";
  label: "Task" | "Feature";
  showsWorkflow: boolean;
};

// How chat messages name an item. Bugs keep the task wording; Features have
// no status or priority to show.
export function chatSubject(type: TaskType | null | undefined): ChatSubject {
  return type === "feature"
    ? { noun: "feature", label: "Feature", showsWorkflow: false }
    : { noun: "task", label: "Task", showsWorkflow: true };
}
