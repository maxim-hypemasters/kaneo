import { useTranslation } from "react-i18next";
import { OptionMenu } from "@/components/common/option-menu/option-menu";
import { useAwayLabels } from "@/components/time-off/away/use-away-labels";
import { assigneeMenuOptions } from "./menus/assignee-menu-options";

type AssigneePickerMenuProps = {
  workspaceId: string;
  members: Parameters<typeof assigneeMenuOptions>[0];
  // undefined when several tasks disagree, so nothing shows as selected.
  current: string | null | undefined;
  onSelect: (userId: string) => void;
};

// The assignee list of a popover. Mounted only while the popover is open, so
// closed pickers on every board card load and format no away labels.
export function AssigneePickerMenu({
  workspaceId,
  members,
  current,
  onSelect,
}: AssigneePickerMenuProps) {
  const { t } = useTranslation();
  const away = useAwayLabels(workspaceId, { enabled: true });

  return (
    <OptionMenu
      label={t("tasks:assignee.label")}
      placeholder={t("tasks:bulk.assigneePlaceholder")}
      options={assigneeMenuOptions(
        members,
        current,
        t("tasks:popover.assignee.unassigned"),
        away,
      )}
      onSelect={onSelect}
    />
  );
}
