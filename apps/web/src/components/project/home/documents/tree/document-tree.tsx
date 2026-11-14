import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  type DragMoveEvent,
  type DragOverEvent,
  type DragStartEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { DocumentTreeRow, TREE_INDENT_PX } from "./document-tree-row";
import { flattenPageTree, type TreePage } from "./page-tree";
import { currentPlace, projectDrop } from "./project-drop";

type Drag = { activeId: string; overId: string; offsetX: number };

// The project's pages as an indented list. Dragging a row up or down moves
// it; dragging it sideways nests it under the row above or lifts it out.
export function DocumentTree({
  pages,
  expanded,
  selectedId,
  canEdit,
  canDelete,
  onToggle,
  onOpen,
  onAddChild,
  onMove,
  onRequestMove,
  onRequestDelete,
}: {
  pages: readonly TreePage[];
  expanded: ReadonlySet<string>;
  selectedId?: string;
  canEdit: boolean;
  canDelete: boolean;
  onToggle: (id: string) => void;
  onOpen: (id: string) => void;
  onAddChild: (parentId: string) => void;
  onMove: (move: {
    id: string;
    parentId: string | null;
    index: number;
  }) => void;
  onRequestMove: (page: TreePage) => void;
  onRequestDelete: (page: TreePage) => void;
}) {
  const { t } = useTranslation();
  const [drag, setDrag] = useState<Drag | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );
  // A dragged page carries its sub-pages, so they are hidden meanwhile.
  const rows = useMemo(() => {
    if (!drag) return flattenPageTree(pages, expanded);
    const visible = new Set(expanded);
    visible.delete(drag.activeId);
    return flattenPageTree(pages, visible);
  }, [drag, expanded, pages]);
  const projected = drag
    ? projectDrop(
        rows,
        drag.activeId,
        drag.overId,
        Math.round(drag.offsetX / TREE_INDENT_PX),
      )
    : null;

  const finish = ({ active }: DragEndEvent) => {
    const id = String(active.id);
    const place = currentPlace(rows, id);
    setDrag(null);
    if (!projected || !place) return;
    if (
      projected.parentId === place.parentId &&
      projected.index === place.index
    )
      return;
    onMove({ id, parentId: projected.parentId, index: projected.index });
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={({ active }: DragStartEvent) =>
        setDrag({
          activeId: String(active.id),
          overId: String(active.id),
          offsetX: 0,
        })
      }
      onDragMove={({ delta }: DragMoveEvent) =>
        setDrag((current) => current && { ...current, offsetX: delta.x })
      }
      onDragOver={({ over }: DragOverEvent) =>
        setDrag(
          (current) =>
            current && over && { ...current, overId: String(over.id) },
        )
      }
      onDragEnd={finish}
      onDragCancel={() => setDrag(null)}
    >
      <SortableContext
        items={rows.map((row) => row.page.id)}
        strategy={verticalListSortingStrategy}
      >
        <ul aria-label={t("tasks:projectHome.documents.pages")}>
          {rows.map((row) => (
            <DocumentTreeRow
              key={row.page.id}
              page={row.page}
              depth={
                drag?.activeId === row.page.id && projected
                  ? projected.depth
                  : row.depth
              }
              hasChildren={row.hasChildren}
              expanded={expanded.has(row.page.id)}
              selected={row.page.id === selectedId}
              canEdit={canEdit}
              canDelete={canDelete}
              onToggle={() => onToggle(row.page.id)}
              onOpen={() => onOpen(row.page.id)}
              onAddChild={() => onAddChild(row.page.id)}
              onMove={() => onRequestMove(row.page)}
              onDelete={() => onRequestDelete(row.page)}
            />
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  );
}
