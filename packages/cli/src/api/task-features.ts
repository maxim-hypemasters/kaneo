import { Effect, Schema } from "effect";
import { KaneoApi } from "./kaneo-api.js";

export const TASK_TYPES = ["task", "bug", "feature"] as const;
export type TaskType = (typeof TASK_TYPES)[number];

// Servers before features send no type, and a later one may add types.
export function taskTypeOf(task: { readonly type?: string }): TaskType {
  return task.type === "feature" || task.type === "bug" ? task.type : "task";
}

const UpdatedTask = Schema.Struct({
  id: Schema.String,
  type: Schema.optionalKey(Schema.String),
  featureId: Schema.optionalKey(Schema.NullOr(Schema.String)),
});

// Puts a task into a feature of its project, or takes it out with null.
export const updateTaskFeature = Effect.fnUntraced(function* (
  id: string,
  featureId: string | null,
) {
  const api = yield* KaneoApi;
  return yield* api.request(
    "PUT",
    `/api/task/feature/${encodeURIComponent(id)}`,
    UpdatedTask,
    { body: { featureId } },
  );
});

export const updateTaskType = Effect.fnUntraced(function* (
  id: string,
  type: Exclude<TaskType, "feature">,
) {
  const api = yield* KaneoApi;
  return yield* api.request(
    "PUT",
    `/api/task/type/${encodeURIComponent(id)}`,
    UpdatedTask,
    { body: { type } },
  );
});
