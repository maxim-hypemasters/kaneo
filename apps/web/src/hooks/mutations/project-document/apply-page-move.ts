type TreePage = { id: string; parentId: string | null; position: number };

function childrenOf<T extends TreePage>(pages: T[], parentId: string | null) {
  return pages
    .filter((page) => page.parentId === parentId)
    .sort((a, b) => a.position - b.position || a.id.localeCompare(b.id));
}

// The tree after moving a page, positioned as the server will store it: the
// moved page sits at `index` among its new siblings, and both the old and the
// new siblings are numbered 0..n-1.
export function applyPageMove<T extends TreePage>(
  pages: T[],
  id: string,
  parentId: string | null,
  index: number,
): T[] {
  const moved = pages.find((page) => page.id === id);
  if (!moved) return pages;
  const positions = new Map<
    string,
    { parentId: string | null; position: number }
  >();
  const siblings = childrenOf(pages, parentId).filter((page) => page.id !== id);
  const at = Math.max(0, Math.min(index, siblings.length));
  [...siblings.slice(0, at), moved, ...siblings.slice(at)].forEach(
    (page, position) => positions.set(page.id, { parentId, position }),
  );
  if (moved.parentId !== parentId)
    childrenOf(pages, moved.parentId)
      .filter((page) => page.id !== id)
      .forEach((page, position) =>
        positions.set(page.id, { parentId: moved.parentId, position }),
      );
  return pages.map((page) => {
    const next = positions.get(page.id);
    return next ? { ...page, ...next } : page;
  });
}
