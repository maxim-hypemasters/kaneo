export const FEATURE_TABS = [
  "overview",
  "activity",
  "documents",
  "issues",
] as const;
export type FeatureTab = (typeof FEATURE_TABS)[number];
export type FeatureWorkspaceSearch = {
  featureTab?: FeatureTab;
  featureDocumentId?: string;
  featureUpdateId?: string;
};

const contentId = (value: unknown) =>
  typeof value === "string" && /^[A-Za-z0-9_-]{1,255}$/.test(value)
    ? value
    : undefined;

export function validateFeatureWorkspaceSearch(
  search: Record<string, unknown>,
): FeatureWorkspaceSearch {
  const featureTab = FEATURE_TABS.find((tab) => tab === search.featureTab);
  if (!featureTab) return {};
  const documentId =
    featureTab === "documents"
      ? contentId(search.featureDocumentId)
      : undefined;
  const updateId =
    featureTab === "activity" ? contentId(search.featureUpdateId) : undefined;
  return {
    featureTab,
    ...(documentId ? { featureDocumentId: documentId } : {}),
    ...(updateId ? { featureUpdateId: updateId } : {}),
  };
}
