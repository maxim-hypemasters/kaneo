// A feature as GET /task/features/{projectId} lists it.
export type ProjectFeature = {
  id: string;
  title: string;
  number: number | null;
  status: string | null;
  releaseId?: string | null;
  archivedAt?: string | null;
};

// The feature a new task joins: one of the project's, or one to create on
// submit, before the task. null is no feature. An existing feature's release
// is kept as the feature list gave it, for the Release chip.
export type FeatureChoice =
  | { kind: "existing"; id: string; title: string; releaseId?: string | null }
  | { kind: "new"; title: string };

// "new" is the chosen feature still to create when selected, else the offer
// to create one named after the search.
export type FeaturePickerOption =
  | { kind: "none"; value: string; selected: boolean }
  | {
      kind: "feature";
      value: string;
      selected: boolean;
      feature: ProjectFeature;
      displayId: string | null;
    }
  | { kind: "new"; value: string; selected: boolean; title: string };

const NO_FEATURE = "";
const CHOSEN_NEW_FEATURE = ":chosen-new";
const CREATE_FEATURE = ":create";

// Without a search: no feature, the chosen new feature, then the project's
// features. With one: the matches by title or ID, then the offer to create
// it unless a feature already has that title. Archived features are left out.
export function featurePickerOptions({
  features,
  query,
  choice,
  slug,
}: {
  features: readonly ProjectFeature[];
  query: string;
  choice: FeatureChoice | null;
  slug: string | undefined;
}): FeaturePickerOption[] {
  const name = query.trim();
  const needle = name.toLowerCase();
  const matches = (text: string | null) =>
    text !== null && text.toLowerCase().includes(needle);
  const listed = features
    .filter(
      (feature) =>
        (!feature.archivedAt && feature.status !== "archived") ||
        (choice?.kind === "existing" && choice.id === feature.id),
    )
    .map((feature) => ({
      feature,
      displayId:
        slug && feature.number !== null ? `${slug}-${feature.number}` : null,
    }));
  const chosenNew = choice?.kind === "new" ? choice.title : null;
  const titleTaken = [
    ...listed.map(({ feature }) => feature.title),
    ...(chosenNew === null ? [] : [chosenNew]),
  ].some((title) => title.toLowerCase() === needle);

  return [
    ...(needle
      ? []
      : [
          {
            kind: "none" as const,
            value: NO_FEATURE,
            selected: choice === null,
          },
        ]),
    ...(chosenNew !== null && matches(chosenNew)
      ? [
          {
            kind: "new" as const,
            value: CHOSEN_NEW_FEATURE,
            selected: true,
            title: chosenNew,
          },
        ]
      : []),
    ...listed
      .filter(
        ({ feature, displayId }) =>
          matches(feature.title) || matches(displayId),
      )
      .map(({ feature, displayId }) => ({
        kind: "feature" as const,
        value: feature.id,
        selected: choice?.kind === "existing" && choice.id === feature.id,
        feature,
        displayId,
      })),
    ...(needle && !titleTaken
      ? [
          {
            kind: "new" as const,
            value: CREATE_FEATURE,
            selected: false,
            title: name,
          },
        ]
      : []),
  ];
}

export function choiceOf(option: FeaturePickerOption): FeatureChoice | null {
  if (option.kind === "none") return null;
  if (option.kind === "feature") {
    return {
      kind: "existing",
      id: option.feature.id,
      title: option.feature.title,
      releaseId: option.feature.releaseId,
    };
  }
  return { kind: "new", title: option.title };
}
