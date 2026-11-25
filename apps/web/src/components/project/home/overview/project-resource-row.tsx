import { Link as LinkIcon, Pencil, XIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { linkHost } from "@/components/external-links/link-host";
import { DragHandle } from "@/components/project/sortable/drag-handle";
import { useSortableRow } from "@/components/project/sortable/use-sortable-row";
import { RowActionsMenu } from "@/components/settings/row-actions-menu";
import type { ProjectLink } from "@/fetchers/project-link/types";
import { cn } from "@/lib/cn";

export function ProjectResourceRow({
  link,
  canEdit,
  disabled,
  onEdit,
  onRemove,
}: {
  link: ProjectLink;
  canEdit: boolean;
  disabled: boolean;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const { t } = useTranslation();
  const { rowRef, rowStyle, isDragging, handleProps } = useSortableRow(
    link.id,
    !canEdit,
  );
  const host = linkHost(link.url);

  return (
    <li
      ref={rowRef}
      style={rowStyle}
      className={cn(
        "group/row flex h-8 min-w-0 items-center gap-2 rounded-md pr-1 pl-2",
        isDragging && "relative z-10 bg-card shadow-sm",
      )}
    >
      {canEdit ? (
        <DragHandle
          label={t("tasks:projectHome.resources.drag", { title: link.title })}
          handleProps={handleProps}
        />
      ) : null}
      <a
        href={link.url}
        target="_blank"
        rel="noopener noreferrer"
        className="group/link flex min-w-0 flex-1 items-center gap-2 self-stretch rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <LinkIcon
          aria-hidden="true"
          className="size-3.5 shrink-0 text-muted-foreground"
        />
        <span className="min-w-0 truncate font-medium text-[13px] group-hover/link:underline">
          {link.title}
        </span>
        {host ? (
          <span className="min-w-0 flex-1 truncate text-muted-foreground text-xs">
            {host}
          </span>
        ) : null}
      </a>
      {canEdit ? (
        <RowActionsMenu
          label={t("tasks:projectHome.resources.actions", {
            title: link.title,
          })}
          actions={[
            {
              id: "edit",
              label: t("tasks:projectHome.resources.edit"),
              icon: Pencil,
              onSelect: onEdit,
              disabled,
            },
            {
              id: "remove",
              label: t("common:actions.remove"),
              icon: XIcon,
              onSelect: onRemove,
              destructive: true,
              disabled,
            },
          ]}
        />
      ) : null}
    </li>
  );
}
