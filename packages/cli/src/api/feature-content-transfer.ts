import { Schema } from "effect";

const Author = Schema.Struct({
  name: Schema.NullOr(Schema.String),
  avatar: Schema.optionalKey(Schema.NullOr(Schema.String)),
});

export const FeatureDocumentTransfer = Schema.Struct({
  key: Schema.String,
  featureKey: Schema.String,
  title: Schema.String,
  body: Schema.String,
  revision: Schema.Number,
  createdAt: Schema.String,
  updatedAt: Schema.String,
  createdBy: Author,
  updatedBy: Author,
});
export type FeatureDocumentTransfer = typeof FeatureDocumentTransfer.Type;

export const FeatureUpdateTransfer = Schema.Struct({
  key: Schema.String,
  featureKey: Schema.String,
  note: Schema.String,
  health: Schema.Literals(["on-track", "at-risk", "off-track"]),
  createdAt: Schema.String,
  updatedAt: Schema.String,
  author: Author,
  milestones: Schema.Array(
    Schema.Struct({
      key: Schema.String,
      title: Schema.String,
      position: Schema.Number,
      total: Schema.Number,
      started: Schema.Number,
      completed: Schema.Number,
      previousTotal: Schema.NullOr(Schema.Number),
      previousCompleted: Schema.NullOr(Schema.Number),
    }),
  ),
});
export type FeatureUpdateTransfer = typeof FeatureUpdateTransfer.Type;
