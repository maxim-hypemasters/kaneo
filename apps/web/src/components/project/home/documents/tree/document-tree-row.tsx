import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ChevronRight, FileText } from "lucide-react";
import { useTranslation } from "react-i18next";
import { DragHandle } from "@/components/project/sortable/drag-handle";
import { cn } from "@/lib/cn";
import { EASE_OUT_CSS } from "@/lib/motion";
import { PageActionsMenu } from "./page-actions-menu";
import type { TreePage } from "./page-tree";

export const TREE_INDENT_PX = 20;

export function DocumentTreeRow({
  page,
  depth,
  hasChildren,
  expanded,
  selected,
  canEdit,
  canDelete,
  onToggle,
  onOpen,
  onAddChild,
  onMove,
  onDelete,
}: {
  page: TreePage;
  // The depth shown, which follows the pointer while the page is dragged.
  depth: number;
  hasChildren: boolean;
  expanded: boolean;
  selected: boolean;
  canEdit: boolean;
  canDelete: boolean;
  onToggle: () => void;
  onOpen: () => void;
  onAddChild: () => void;
  onMove: () => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation();
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: page.id,
    disabled: !canEdit,
    transition: { duration: 200, easing: EASE_OUT_CSS },
  });
  const title = page.title || t("tasks:projectHome.documents.untitled");

  return (
    <li
      ref={setNodeRef}
      // Sideways drags change the depth instead of moving the row.
      style={{
        transform: CSS.Translate.toString(transform && { ...transform, x: 0 }),
        transition,
      }}
      className={cn("group/row relative", isDragging && "z-10")}
    >
      <div
        className={cn(
          "flex h-8 min-w-0 items-center gap-1 rounded-md pr-1 transition-colors hover:bg-accent/50",
          selected && "bg-accent",
          isDragging && "bg-card shadow-md ring-1 ring-border",
        )}
        style={{ paddingLeft: depth * TREE_INDENT_PX + 4 }}
      >
        <DragHandle
          label={t("tasks:projectHome.documents.dragPage", { title })}
          handleProps={{
            ref: setActivatorNodeRef,
            ...attributes,
            ...listeners,
          }}
          disabled={!canEdit}
        />
        {hasChildren ? (
          <button
            type="button"
            aria-expanded={expanded}
            aria-label={t(
              expanded
                ? "tasks:projectHome.documents.collapse"
                : "tasks:projectHome.documents.expand",
              { title },
            )}
            onClick={onToggle}
            className="flex size-5 shrink-0 items-center justify-center rounded-sm text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ChevronRight
              aria-hidden="true"
              className={cn(
                "size-3.5 transition-transform duration-150 motion-reduce:transition-none",
                expanded && "rotate-90",
              )}
            />
          </button>
        ) : (
          <span aria-hidden="true" className="size-5 shrink-0" />
        )}
        <button
          type="button"
          onClick={onOpen}
          aria-current={selected ? "page" : undefined}
          className="flex min-w-0 flex-1 items-center gap-2 rounded-sm py-1 text-left text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <FileText
            aria-hidden="true"
            className="size-4 shrink-0 text-muted-foreground"
          />
          <span className="truncate" title={title}>
            {title}
          </span>
        </button>
        <PageActionsMenu
          title={title}
          canEdit={canEdit}
          canDelete={canDelete}
          onAddChild={onAddChild}
          onMove={onMove}
          onDelete={onDelete}
        />
      </div>
    </li>
  );
}
