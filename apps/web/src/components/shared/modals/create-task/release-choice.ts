import type { FeatureIndex } from "@/lib/features/feature-index";
import type { FeatureChoice } from "./feature-picker-options";

// The release a new task starts in: its feature's ("follow", what the API
// does when releaseId is omitted), or one picked in the dialog, null for none.
export type ReleaseChoice =
  | { kind: "follow" }
  | { kind: "set"; id: string | null };

export const FOLLOW_FEATURE_RELEASE: ReleaseChoice = { kind: "follow" };

export function initialReleaseChoice(
  releaseId: string | undefined,
): ReleaseChoice {
  return releaseId ? { kind: "set", id: releaseId } : FOLLOW_FEATURE_RELEASE;
}

export function sameReleaseChoice(left: ReleaseChoice, right: ReleaseChoice) {
  if (left.kind === "follow" || right.kind === "follow") {
    return left.kind === right.kind;
  }
  return left.id === right.id;
}

// The create request's field: left out to follow the feature.
export function releaseRequest(choice: ReleaseChoice): {
  releaseId?: string | null;
} {
  return choice.kind === "set" ? { releaseId: choice.id } : {};
}

// The chosen feature's release: from the cached board, which websocket
// messages keep current while the dialog stays open, else as the feature list
// gave it when picked. The server uses the feature's release at creation. A
// feature still to create has none.
export function featureReleaseOf(
  feature: FeatureChoice | null,
  index: FeatureIndex,
): string | null {
  if (feature?.kind !== "existing") return null;
  const live = index.features.get(feature.id)?.releaseId;
  if (live !== undefined) return live;
  return feature.releaseId ?? null;
}

// The release the new task will be in, and whether it comes from the feature.
export function shownRelease(
  choice: ReleaseChoice,
  featureReleaseId: string | null,
): { id: string | null; fromFeature: boolean } {
  if (choice.kind === "set") return { id: choice.id, fromFeature: false };
  return { id: featureReleaseId, fromFeature: featureReleaseId !== null };
}
