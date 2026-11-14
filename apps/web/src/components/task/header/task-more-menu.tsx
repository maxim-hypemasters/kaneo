import type { AlertDialog as AlertDialogPrimitive } from "@base-ui/react/alert-dialog";
import {
  CopyIcon,
  Ellipsis,
  FileTextIcon,
  GitBranchIcon,
  HashIcon,
  LinkIcon,
  Trash2Icon,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { ShortcutKeys } from "@/components/shortcuts/shortcut-keys";
import { Button } from "@/components/ui/button";
import {
  Menu,
  MenuItem,
  MenuPopup,
  MenuSeparator,
  MenuShortcut,
  MenuTrigger,
} from "@/components/ui/menu";
import { useWorkspacePermission } from "@/hooks/use-workspace-permission";
import type { useTaskCopyActions } from "./use-task-copy-actions";

type TaskMoreMenuProps = {
  actions: ReturnType<typeof useTaskCopyActions>;
  deleteHandle: AlertDialogPrimitive.Handle<unknown>;
  taskType?: string;
};

export function TaskMoreMenu({
  actions,
  deleteHandle,
  taskType,
}: TaskMoreMenuProps) {
  const { t } = useTranslation();
  const { canWorkItem } = useWorkspacePermission();

  return (
    <Menu>
      <MenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t("tasks:bulk.moreActions")}
            className="text-muted-foreground hover:text-foreground data-popup-open:bg-accent [&_svg]:size-[15px]"
          />
        }
      >
        <Ellipsis />
      </MenuTrigger>
      <MenuPopup align="end" className="min-w-56">
        <MenuItem onClick={actions.copyLink} className="sm:hidden">
          <LinkIcon />
          {actions.labels.copyLink}
        </MenuItem>
        {actions.canCopyBranch && (
          <MenuItem onClick={actions.copyBranch} className="sm:hidden">
            <GitBranchIcon />
            {t("tasks:properties.copyTaskBranch")}
          </MenuItem>
        )}
        <MenuItem onClick={actions.copyId}>
          <HashIcon />
          {actions.labels.copyId}
          <MenuShortcut>
            <ShortcutKeys id="copyTaskId" tone="muted" />
          </MenuShortcut>
        </MenuItem>
        <MenuItem onClick={actions.copyTitle}>
          <CopyIcon />
          {actions.labels.copyTitle}
          <MenuShortcut>
            <ShortcutKeys id="copyTaskTitle" tone="muted" />
          </MenuShortcut>
        </MenuItem>
        <MenuItem onClick={actions.copyMarkdown}>
          <FileTextIcon />
          {t("navigation:shortcuts.items.copyAsMarkdown")}
          <MenuShortcut>
            <ShortcutKeys id="copyAsMarkdown" tone="muted" />
          </MenuShortcut>
        </MenuItem>
        {canWorkItem(taskType, "delete") && (
          <>
            <MenuSeparator />
            <MenuItem
              variant="destructive"
              onClick={() => deleteHandle.open(null)}
            >
              <Trash2Icon />
              {actions.labels.delete}
              <MenuShortcut>
                <ShortcutKeys id="deleteTask" tone="muted" />
              </MenuShortcut>
            </MenuItem>
          </>
        )}
      </MenuPopup>
    </Menu>
  );
}
