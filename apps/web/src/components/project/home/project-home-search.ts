export type ProjectHomeTab = "overview" | "documents";

export type ProjectHomeSearch = {
  tab?: "documents";
  // The open document: a project page, or a Feature document together with
  // its Feature.
  documentId?: string;
  documentFeatureId?: string;
};

const contentId = (value: unknown) =>
  typeof value === "string" && /^[A-Za-z0-9_-]{1,255}$/.test(value)
    ? value
    : undefined;

// Overview is the default tab, so it stays out of the URL.
export function validateProjectHomeSearch(
  search: Record<string, unknown>,
): ProjectHomeSearch {
  if (search.tab !== "documents") return {};
  const documentId = contentId(search.documentId);
  const documentFeatureId = documentId
    ? contentId(search.documentFeatureId)
    : undefined;
  return {
    tab: "documents",
    ...(documentId ? { documentId } : {}),
    ...(documentFeatureId ? { documentFeatureId } : {}),
  };
}

// Links made before the home page existed opened a task (and its Feature
// tabs) on top of the default view; those still go there.
export function opensTaskOnDefaultView(search: {
  taskId?: string;
  featureTab?: string;
}) {
  return Boolean(search.taskId || search.featureTab);
}
