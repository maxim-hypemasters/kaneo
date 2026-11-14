import type { TreeRow } from "./page-tree";

export type DropTarget = {
  parentId: string | null;
  // Position among the new parent's children, without the dragged page.
  index: number;
  depth: number;
};

function moveRow<T>(rows: readonly T[], from: number, to: number) {
  const next = [...rows];
  const [row] = next.splice(from, 1);
  next.splice(to, 0, row as T);
  return next;
}

// Where a dragged page lands: over another row vertically, nested by how far
// it was dragged sideways. `rows` hide the dragged page's sub-pages. The depth
// is limited to one level below the row above and no shallower than the row
// below, so the drop always describes a valid tree.
export function projectDrop(
  rows: readonly TreeRow[],
  activeId: string,
  overId: string,
  depthOffset: number,
): DropTarget | null {
  const activeIndex = rows.findIndex((row) => row.page.id === activeId);
  const overIndex = rows.findIndex((row) => row.page.id === overId);
  const active = rows[activeIndex];
  if (!active || overIndex < 0) return null;
  const moved = moveRow(rows, activeIndex, overIndex);
  const previous = moved[overIndex - 1];
  const next = moved[overIndex + 1];
  const maxDepth = previous ? previous.depth + 1 : 0;
  const minDepth = next ? next.depth : 0;
  const depth = Math.min(
    maxDepth,
    Math.max(minDepth, active.depth + depthOffset),
  );
  let parentId: string | null = null;
  if (previous && depth > 0) {
    if (depth === previous.depth) parentId = previous.parentId;
    else if (depth > previous.depth) parentId = previous.page.id;
    else
      parentId =
        moved
          .slice(0, overIndex)
          .reverse()
          .find((row) => row.depth === depth)?.parentId ?? null;
  }
  const index = moved
    .slice(0, overIndex)
    .filter(
      (row) => row.parentId === parentId && row.page.id !== activeId,
    ).length;
  return { parentId, index, depth };
}

// The dragged page's current place, to skip drops that change nothing.
export function currentPlace(
  rows: readonly TreeRow[],
  id: string,
): { parentId: string | null; index: number } | null {
  const row = rows.find((candidate) => candidate.page.id === id);
  if (!row) return null;
  const index = rows
    .filter((candidate) => candidate.parentId === row.parentId)
    .findIndex((candidate) => candidate.page.id === id);
  return { parentId: row.parentId, index };
}
