// The release a new task starts in: its milestone's ("follow", what the API
// does when releaseId is omitted), or one picked in the dialog, null for none.
export type ReleaseChoice =
  | { kind: "follow" }
  | { kind: "set"; id: string | null };

export const FOLLOW_MILESTONE_RELEASE: ReleaseChoice = { kind: "follow" };

export function initialReleaseChoice(
  releaseId: string | undefined,
): ReleaseChoice {
  return releaseId ? { kind: "set", id: releaseId } : FOLLOW_MILESTONE_RELEASE;
}

export function sameReleaseChoice(left: ReleaseChoice, right: ReleaseChoice) {
  if (left.kind === "follow" || right.kind === "follow") {
    return left.kind === right.kind;
  }
  return left.id === right.id;
}

// The create request's field: left out to follow the milestone.
export function releaseRequest(choice: ReleaseChoice): {
  releaseId?: string | null;
} {
  return choice.kind === "set" ? { releaseId: choice.id } : {};
}

// The release the new task will be in, and whether it comes from the milestone.
export function shownRelease(
  choice: ReleaseChoice,
  milestoneReleaseId: string | null,
): { id: string | null; fromMilestone: boolean } {
  if (choice.kind === "set") return { id: choice.id, fromMilestone: false };
  return { id: milestoneReleaseId, fromMilestone: milestoneReleaseId !== null };
}
