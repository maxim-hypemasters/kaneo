import { Effect, Schema } from "effect";
import { KaneoApi } from "./kaneo-api.js";

const nullable = Schema.NullOr(Schema.String);
export const Milestone = Schema.Struct({
  id: Schema.String,
  featureId: Schema.String,
  title: Schema.String,
  description: nullable,
  startDate: nullable,
  endDate: nullable,
  position: Schema.Number,
  createdAt: Schema.String,
  updatedAt: Schema.String,
  progress: Schema.Struct({
    total: Schema.Number,
    started: Schema.Number,
    completed: Schema.Number,
  }),
});
export type Milestone = typeof Milestone.Type;
export type MilestoneFields = {
  readonly title?: string;
  readonly description?: string | null;
  readonly startDate?: string | null;
  readonly endDate?: string | null;
};
const featurePath = (id: string) =>
  `/api/milestone/feature/${encodeURIComponent(id)}`;
const itemPath = (id: string) => `/api/milestone/${encodeURIComponent(id)}`;
export const listMilestones = Effect.fnUntraced(function* (featureId: string) {
  const api = yield* KaneoApi;
  return yield* api.request(
    "GET",
    featurePath(featureId),
    Schema.Array(Milestone),
  );
});
export const getMilestone = Effect.fnUntraced(function* (id: string) {
  const api = yield* KaneoApi;
  return yield* api.request("GET", itemPath(id), Milestone);
});
export const createMilestone = Effect.fnUntraced(function* (
  featureId: string,
  body: MilestoneFields & {
    readonly title: string;
    readonly taskIds?: ReadonlyArray<string>;
  },
) {
  const api = yield* KaneoApi;
  return yield* api.request("POST", featurePath(featureId), Milestone, {
    body,
  });
});
export const updateMilestone = Effect.fnUntraced(function* (
  id: string,
  body: MilestoneFields,
) {
  const api = yield* KaneoApi;
  return yield* api.request("PATCH", itemPath(id), Milestone, { body });
});
export const deleteMilestone = Effect.fnUntraced(function* (id: string) {
  const api = yield* KaneoApi;
  return yield* api.request(
    "DELETE",
    itemPath(id),
    Schema.Struct({ id: Schema.String }),
  );
});
export const reorderMilestones = Effect.fnUntraced(function* (
  featureId: string,
  milestoneIds: ReadonlyArray<string>,
) {
  const api = yield* KaneoApi;
  return yield* api.request(
    "PUT",
    `${featurePath(featureId)}/order`,
    Schema.Array(Milestone),
    { body: { milestoneIds } },
  );
});
export const updateTaskMilestone = Effect.fnUntraced(function* (
  taskId: string,
  milestoneId: string | null,
) {
  const api = yield* KaneoApi;
  return yield* api.request(
    "PATCH",
    `/api/task/${encodeURIComponent(taskId)}/milestone`,
    Schema.Struct({ id: Schema.String }),
    { body: { milestoneId } },
  );
});
