import { ArrowRightLeft, PencilIcon, Trash2Icon } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  type RowAction,
  RowActionsMenu,
} from "@/components/settings/row-actions-menu";
import type { ReleasePermissions } from "./use-release-permissions";

type ReleaseActionsMenuProps = {
  name: string;
  permissions: ReleasePermissions;
  onEdit: () => void;
  onDelete: () => void;
  // Left out where Move unfinished has its own button.
  onMoveUnfinished?: () => void;
};

export function ReleaseActionsMenu({
  name,
  permissions,
  onEdit,
  onDelete,
  onMoveUnfinished,
}: ReleaseActionsMenuProps) {
  const { t } = useTranslation();
  const actions: RowAction[] = [];

  if (permissions.canManage) {
    actions.push({
      id: "edit",
      label: t("tasks:releases.edit"),
      icon: PencilIcon,
      onSelect: onEdit,
    });
  }
  if (permissions.canMoveItems && onMoveUnfinished) {
    actions.push({
      id: "move-unfinished",
      label: t("tasks:releases.moveUnfinished.action"),
      icon: ArrowRightLeft,
      onSelect: onMoveUnfinished,
    });
  }
  if (permissions.canDelete) {
    actions.push({
      id: "delete",
      label: t("tasks:releases.delete"),
      icon: Trash2Icon,
      destructive: true,
      onSelect: onDelete,
    });
  }

  if (actions.length === 0) return null;

  return (
    <RowActionsMenu
      label={t("tasks:releases.pages.actionsFor", { name })}
      actions={actions}
    />
  );
}
