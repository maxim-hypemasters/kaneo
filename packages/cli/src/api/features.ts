import { Effect, Schema } from "effect";
import { KaneoApi } from "./kaneo-api.js";
import { BoardLabel } from "./schemas.js";

const Feature = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  number: Schema.NullOr(Schema.Number),
  description: Schema.NullOr(Schema.String),
  archivedAt: Schema.NullOr(Schema.String),
  milestoneCount: Schema.Number,
  labels: Schema.Array(BoardLabel),
});
const FeaturePage = Schema.Struct({
  data: Schema.Array(Feature),
  pagination: Schema.Struct({
    total: Schema.Number,
    page: Schema.Number,
    limit: Schema.Number,
    totalPages: Schema.Number,
  }),
});
export const listFeatures = Effect.fnUntraced(function* (
  projectId: string,
  options: {
    readonly archived?: boolean;
    readonly search?: string;
    readonly page?: number;
    readonly limit?: number;
  },
) {
  const api = yield* KaneoApi;
  return yield* api.request(
    "GET",
    `/api/task/feature-library/${encodeURIComponent(projectId)}`,
    FeaturePage,
    {
      query: {
        archived: options.archived ? "true" : "false",
        search: options.search,
        page: options.page,
        limit: options.limit,
      },
    },
  );
});
export const setFeatureArchived = Effect.fnUntraced(function* (
  id: string,
  archived: boolean,
) {
  const api = yield* KaneoApi;
  return yield* api.request(
    "PUT",
    `/api/task/${encodeURIComponent(id)}/feature-archive`,
    Schema.Struct({
      id: Schema.String,
      archivedAt: Schema.NullOr(Schema.String),
    }),
    { body: { archived } },
  );
});
