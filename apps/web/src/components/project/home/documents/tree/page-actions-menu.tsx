import { FolderInput, MoreHorizontal, Plus, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/menu";

export function PageActionsMenu({
  title,
  canCreate,
  canMove,
  canDelete,
  onAddChild,
  onMove,
  onDelete,
}: {
  title: string;
  canCreate: boolean;
  canMove: boolean;
  canDelete: boolean;
  onAddChild: () => void;
  onMove: () => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation();
  if (!canCreate && !canMove && !canDelete) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            aria-label={t("tasks:projectHome.documents.pageActions", { title })}
            className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-0 outline-none transition-opacity hover:bg-accent hover:text-foreground focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring group-hover/row:opacity-100 data-popup-open:opacity-100 max-md:opacity-100"
          />
        }
      >
        <MoreHorizontal className="size-3.5" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-44">
        {canCreate && (
          <DropdownMenuItem onClick={onAddChild}>
            <Plus className="text-muted-foreground" />
            {t("tasks:projectHome.documents.addSubPage")}
          </DropdownMenuItem>
        )}
        {canMove && (
          <DropdownMenuItem onClick={onMove}>
            <FolderInput className="text-muted-foreground" />
            {t("tasks:projectHome.documents.moveTo")}
          </DropdownMenuItem>
        )}
        {(canCreate || canMove) && canDelete && <DropdownMenuSeparator />}
        {canDelete && (
          <DropdownMenuItem variant="destructive" onClick={onDelete}>
            <Trash2 />
            {t("tasks:projectHome.documents.delete")}
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
