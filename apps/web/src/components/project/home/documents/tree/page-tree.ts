export type TreePage = {
  id: string;
  parentId: string | null;
  position: number;
  title: string;
};

// A visible row of the page tree, in reading order.
export type TreeRow<T extends TreePage = TreePage> = {
  page: T;
  depth: number;
  parentId: string | null;
  hasChildren: boolean;
};

function byPosition(a: TreePage, b: TreePage) {
  return a.position - b.position || a.id.localeCompare(b.id);
}

// Children of each page, ordered. A page whose parent is missing (deleted by
// someone else a moment ago) is shown at the top level.
export function childrenByParent<T extends TreePage>(pages: readonly T[]) {
  const ids = new Set(pages.map((page) => page.id));
  const children = new Map<string | null, T[]>();
  for (const page of pages) {
    const parentId =
      page.parentId && ids.has(page.parentId) ? page.parentId : null;
    const list = children.get(parentId) ?? [];
    list.push(page);
    children.set(parentId, list);
  }
  for (const list of children.values()) list.sort(byPosition);
  return children;
}

// Rows for the expanded part of the tree. `skip` hides a page and its
// sub-pages, as the page being dragged does.
export function flattenPageTree<T extends TreePage>(
  pages: readonly T[],
  expanded: ReadonlySet<string>,
  skip?: string,
): TreeRow<T>[] {
  const children = childrenByParent(pages);
  const rows: TreeRow<T>[] = [];
  const visit = (parentId: string | null, depth: number) => {
    for (const page of children.get(parentId) ?? []) {
      if (page.id === skip) continue;
      const hasChildren = Boolean(children.get(page.id)?.length);
      rows.push({ page, depth, parentId, hasChildren });
      if (hasChildren && expanded.has(page.id)) visit(page.id, depth + 1);
    }
  };
  visit(null, 0);
  return rows;
}

// Every sub-page below `id`, at any depth.
export function descendantIds(
  pages: readonly TreePage[],
  id: string,
): Set<string> {
  const children = childrenByParent(pages);
  const found = new Set<string>();
  const stack = [...(children.get(id) ?? [])];
  while (stack.length) {
    const page = stack.pop()!;
    if (found.has(page.id)) continue;
    found.add(page.id);
    stack.push(...(children.get(page.id) ?? []));
  }
  return found;
}

// The pages above `id`, nearest first, so an open page can be revealed.
export function ancestorIds(pages: readonly TreePage[], id: string): string[] {
  const byId = new Map(pages.map((page) => [page.id, page]));
  const ancestors: string[] = [];
  let parentId = byId.get(id)?.parentId ?? null;
  while (parentId && byId.has(parentId) && !ancestors.includes(parentId)) {
    ancestors.push(parentId);
    parentId = byId.get(parentId)?.parentId ?? null;
  }
  return ancestors;
}
