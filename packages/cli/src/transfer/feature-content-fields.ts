import { Result, Schema } from "effect";
import {
  FeatureDocumentTransfer,
  FeatureUpdateTransfer,
} from "../api/feature-content-transfer.js";
import { InvalidArgument } from "../errors/errors.js";

const Fields = Schema.Struct({
  featureDocuments: Schema.optionalKey(Schema.Array(FeatureDocumentTransfer)),
  featureUpdates: Schema.optionalKey(Schema.Array(FeatureUpdateTransfer)),
});
const timestamp = (value: string) =>
  /^\d{4}-\d{2}-\d{2}T/.test(value) && !Number.isNaN(Date.parse(value));
const key = (value: string) => value.trim().length > 0;
const integer = (value: number) => Number.isSafeInteger(value) && value >= 0;
const title = (value: string) => key(value) && value.trim().length <= 255;

export function parseFeatureContent(
  document: Readonly<Record<string, unknown>>,
  features: ReadonlySet<string>,
  milestones: ReadonlyMap<string, { readonly featureKey: string }>,
) {
  const fail = () =>
    Result.fail(
      new InvalidArgument({
        message: "Invalid Feature document or update snapshot metadata.",
      }),
    );
  const parsed = Schema.decodeUnknownResult(Fields)(document);
  if (Result.isFailure(parsed)) return fail();
  const content = parsed.success;
  if (
    document.version !== 5 &&
    ((content.featureDocuments?.length ?? 0) > 0 ||
      (content.featureUpdates?.length ?? 0) > 0)
  )
    return fail();
  for (const rows of [content.featureDocuments, content.featureUpdates]) {
    const keys = new Set<string>();
    for (const item of rows ?? []) {
      if (
        !key(item.key) ||
        keys.has(item.key) ||
        !features.has(item.featureKey) ||
        !timestamp(item.createdAt) ||
        !timestamp(item.updatedAt)
      )
        return fail();
      keys.add(item.key);
    }
  }
  for (const item of content.featureDocuments ?? []) {
    if (
      !title(item.title) ||
      item.body.length > 1_000_000 ||
      !integer(item.revision) ||
      item.revision < 1 ||
      item.revision > 2_147_483_647
    )
      return fail();
  }
  for (const item of content.featureUpdates ?? []) {
    if (!key(item.note) || item.note.length > 100_000) return fail();
    const keys = new Set<string>();
    for (const snapshot of item.milestones) {
      if (
        !key(snapshot.key) ||
        keys.has(snapshot.key) ||
        !title(snapshot.title) ||
        [
          snapshot.position,
          snapshot.total,
          snapshot.started,
          snapshot.completed,
          snapshot.previousTotal,
          snapshot.previousCompleted,
        ].some((value) => value !== null && !integer(value)) ||
        (milestones.has(snapshot.key) &&
          milestones.get(snapshot.key)?.featureKey !== item.featureKey)
      )
        return fail();
      keys.add(snapshot.key);
    }
  }
  return Result.succeed(content);
}
