import type { ProjectDocumentTree } from "@/fetchers/project-document/types";

// The project's documents list with one page or Feature document renamed.
// The same tree comes back when the title is unchanged, so a save of the
// text alone re-renders nothing.
export function withDocumentTitle(
  tree: ProjectDocumentTree,
  id: string,
  title: string,
): ProjectDocumentTree {
  const page = tree.pages.find((item) => item.id === id);
  if (page)
    return page.title === title
      ? tree
      : {
          ...tree,
          pages: tree.pages.map((item) =>
            item === page ? { ...item, title } : item,
          ),
        };
  const group = tree.features.find((item) =>
    item.documents.some((document) => document.id === id),
  );
  if (!group || group.documents.some((d) => d.id === id && d.title === title))
    return tree;
  return {
    ...tree,
    features: tree.features.map((item) =>
      item === group
        ? {
            ...item,
            documents: item.documents.map((document) =>
              document.id === id ? { ...document, title } : document,
            ),
          }
        : item,
    ),
  };
}
