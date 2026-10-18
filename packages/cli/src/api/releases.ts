import { Effect, Schema } from "effect";
import { KaneoApi } from "./kaneo-api.js";

const ItemCounts = Schema.Struct({
  total: Schema.Number,
  completed: Schema.Number,
});

export const ReleaseProgress = Schema.Struct({
  tasks: ItemCounts,
  features: ItemCounts,
  unfinished: Schema.Number,
});
export type ReleaseProgress = typeof ReleaseProgress.Type;

const releaseFields = {
  id: Schema.String,
  projectId: Schema.String,
  name: Schema.String,
  description: Schema.NullOr(Schema.String),
  startDate: Schema.String,
  codeFreezeDate: Schema.String,
  submissionDate: Schema.String,
  createdAt: Schema.String,
  updatedAt: Schema.String,
};

// Create and update answer without progress; list and get include it.
export const Release = Schema.Struct({
  ...releaseFields,
  progress: Schema.optionalKey(ReleaseProgress),
});
export type Release = typeof Release.Type;

const ReleaseList = Schema.Array(Release);

const DeletedRelease = Schema.Struct({ id: Schema.String });

const TaskReleaseResult = Schema.Struct({
  id: Schema.String,
  releaseId: Schema.optionalKey(Schema.NullOr(Schema.String)),
  movedTaskIds: Schema.Array(Schema.String),
});

export type ReleaseDates = {
  readonly startDate: string;
  readonly codeFreezeDate: string;
  readonly submissionDate: string;
};

export type CreateReleaseBody = ReleaseDates & {
  readonly name: string;
  readonly description?: string;
};

export type UpdateReleaseBody = Partial<ReleaseDates> & {
  readonly name?: string;
  readonly description?: string | null;
};

export const listReleases = Effect.fnUntraced(function* (projectId: string) {
  const api = yield* KaneoApi;
  return yield* api.request(
    "GET",
    `/api/release/project/${encodeURIComponent(projectId)}`,
    ReleaseList,
  );
});

export const createRelease = Effect.fnUntraced(function* (
  projectId: string,
  body: CreateReleaseBody,
) {
  const api = yield* KaneoApi;
  return yield* api.request(
    "POST",
    `/api/release/project/${encodeURIComponent(projectId)}`,
    Release,
    { body },
  );
});

export const updateRelease = Effect.fnUntraced(function* (
  id: string,
  body: UpdateReleaseBody,
) {
  const api = yield* KaneoApi;
  return yield* api.request(
    "PUT",
    `/api/release/${encodeURIComponent(id)}`,
    Release,
    { body },
  );
});

export const deleteRelease = Effect.fnUntraced(function* (id: string) {
  const api = yield* KaneoApi;
  return yield* api.request(
    "DELETE",
    `/api/release/${encodeURIComponent(id)}`,
    DeletedRelease,
  );
});

// Puts a task or feature into a release of its project, or takes it out with
// null. A feature's tasks that were in its previous release move with it.
export const updateTaskRelease = Effect.fnUntraced(function* (
  taskId: string,
  releaseId: string | null,
) {
  const api = yield* KaneoApi;
  return yield* api.request(
    "PUT",
    `/api/task/release/${encodeURIComponent(taskId)}`,
    TaskReleaseResult,
    { body: { releaseId } },
  );
});
