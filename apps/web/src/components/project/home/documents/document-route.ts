import { PROJECT_HOME_PATH } from "@/components/project/views/project-views";
import type { ProjectHomeSearch } from "../project-home-search";

// Opens a project page, or a Feature document together with its Feature, in
// the project's Documents tab, on a comment thread when one is given.
export function documentRoute(
  workspaceId: string,
  projectId: string,
  document: {
    id: string;
    featureId?: string | null;
    commentId?: string | null;
  },
) {
  const search: ProjectHomeSearch = {
    tab: "documents",
    documentId: document.id,
    ...(document.featureId ? { documentFeatureId: document.featureId } : {}),
    ...(document.commentId ? { commentId: document.commentId } : {}),
  };
  return {
    to: PROJECT_HOME_PATH,
    params: { workspaceId, projectId },
    search,
  } as const;
}
