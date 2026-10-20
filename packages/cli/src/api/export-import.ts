import { Effect, Schema } from "effect";
import { KaneoApi } from "./kaneo-api.js";
import type { TaskType } from "./task-features.js";

const NullableString = Schema.NullOr(Schema.String);
export const PlanningSnapshot = Schema.Struct({
  projectId: Schema.optionalKey(NullableString),
  createdAt: Schema.optionalKey(Schema.String),
  status: Schema.optionalKey(NullableString),
  columnId: Schema.optionalKey(NullableString),
  priority: Schema.optionalKey(NullableString),
  userId: Schema.optionalKey(NullableString),
  startDate: Schema.optionalKey(NullableString),
  dueDate: Schema.optionalKey(NullableString),
  releaseId: Schema.optionalKey(NullableString),
  releaseName: Schema.optionalKey(NullableString),
  archivedAt: Schema.optionalKey(NullableString),
});
export type PlanningSnapshot = typeof PlanningSnapshot.Type;
export const ExportedRelease = Schema.Struct({
  key: Schema.String,
  name: Schema.String,
  startDate: Schema.String,
  codeFreezeDate: Schema.String,
  submissionDate: Schema.String,
});
export type ExportedRelease = typeof ExportedRelease.Type;

export const ExportedTask = Schema.Struct({
  key: Schema.optionalKey(Schema.String),
  featureKey: Schema.optionalKey(NullableString),
  milestoneKey: Schema.optionalKey(NullableString),
  releaseKey: Schema.optionalKey(NullableString),
  archivedAt: Schema.optionalKey(NullableString),
  planningSnapshots: Schema.optionalKey(Schema.Array(PlanningSnapshot)),
  title: Schema.String,
  type: Schema.optionalKey(Schema.String),
  description: Schema.String,
  status: NullableString,
  priority: NullableString,
  dueDate: NullableString,
  startDate: NullableString,
  userId: NullableString,
  labels: Schema.Array(
    Schema.Struct({ name: Schema.String, color: Schema.String }),
  ),
});
export type ExportedTask = typeof ExportedTask.Type;

export const ExportedMilestone = Schema.Struct({
  key: Schema.String,
  featureKey: Schema.String,
  title: Schema.String,
  description: NullableString,
  startDate: NullableString,
  endDate: NullableString,
  position: Schema.Number,
  leadId: Schema.optionalKey(NullableString),
  status: Schema.optionalKey(Schema.String),
  priority: Schema.optionalKey(Schema.String),
  releaseKey: Schema.optionalKey(NullableString),
});
export type ExportedMilestone = typeof ExportedMilestone.Type;

export const TaskExport = Schema.Struct({
  version: Schema.optionalKey(
    Schema.Union([Schema.Literal(2), Schema.Literal(3)]),
  ),
  releases: Schema.optionalKey(Schema.Array(ExportedRelease)),
  milestones: Schema.optionalKey(Schema.Array(ExportedMilestone)),
  project: Schema.Struct({
    name: Schema.String,
    slug: Schema.String,
    description: NullableString,
    exportedAt: Schema.String,
  }),
  tasks: Schema.Array(ExportedTask),
});
export type TaskExport = typeof TaskExport.Type;

export type ImportTaskBody = {
  readonly key?: string;
  readonly featureKey?: string | null;
  readonly milestoneKey?: string | null;
  readonly releaseKey?: string | null;
  readonly archivedAt?: string | null;
  readonly planningSnapshots?: ReadonlyArray<PlanningSnapshot>;
  readonly labels?: ReadonlyArray<{
    readonly name: string;
    readonly color: string;
  }>;
  readonly title: string;
  readonly type?: TaskType;
  readonly description?: string;
  readonly status: string | null;
  readonly priority?: string;
  readonly startDate?: string | null;
  readonly dueDate?: string | null;
  readonly userId?: string | null;
};

export const ImportOutcome = Schema.Struct({
  success: Schema.Boolean,
  error: Schema.optionalKey(Schema.String),
  warnings: Schema.optionalKey(Schema.Array(Schema.String)),
  task: Schema.Struct({
    id: Schema.optionalKey(Schema.String),
    number: Schema.optionalKey(Schema.NullOr(Schema.Number)),
    title: Schema.String,
    status: Schema.optionalKey(NullableString),
  }),
});
export type ImportOutcome = typeof ImportOutcome.Type;

export const ImportResult = Schema.Struct({
  results: Schema.Struct({
    total: Schema.Number,
    successful: Schema.Number,
    failed: Schema.Number,
    tasks: Schema.Array(ImportOutcome),
  }),
});
export type ImportResult = typeof ImportResult.Type;

export const exportTasks = Effect.fnUntraced(function* (projectId: string) {
  const api = yield* KaneoApi;
  return yield* api.request(
    "GET",
    `/api/task/export/${encodeURIComponent(projectId)}`,
    TaskExport,
  );
});

export const importTasks = Effect.fnUntraced(function* (
  projectId: string,
  tasks: ReadonlyArray<ImportTaskBody>,
  hierarchy?: {
    readonly version: 2 | 3;
    readonly releases?: ReadonlyArray<ExportedRelease>;
    readonly milestones: ReadonlyArray<ExportedMilestone>;
  },
) {
  const api = yield* KaneoApi;
  return yield* api.request(
    "POST",
    `/api/task/import/${encodeURIComponent(projectId)}`,
    ImportResult,
    { body: { tasks, ...hierarchy } },
  );
});
