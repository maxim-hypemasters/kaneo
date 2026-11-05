import { useState } from "react";
import { useTranslation } from "react-i18next";
import { OptionMenu } from "@/components/common/option-menu/option-menu";
import { assigneeMenuOptions } from "@/components/task/menus/assignee-menu-options";
import { AssigneeAvatar } from "@/components/task/properties/assignee-avatar";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import useGetProjectMembers from "@/hooks/queries/workspace-users/use-get-project-members";

export type ReleasePlanAssigneeChoice = {
  userId: string | null;
  name: string | null;
};

export function ReleasePlanAssigneeInput({
  value,
  projectId,
  workspaceId,
  editable,
  disabled,
  saving,
  error,
  onSave,
}: {
  value: ReleasePlanAssigneeChoice;
  projectId: string;
  workspaceId: string;
  editable: boolean;
  disabled?: boolean;
  saving: boolean;
  error: string | null;
  onSave: (choice: ReleasePlanAssigneeChoice) => Promise<boolean>;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  const members = useGetProjectMembers({
    workspaceId,
    projectId,
    enabled: editable && open,
  });
  const blocked = disabled || saving;
  const label = value.userId
    ? (value.name ?? t("common:people.unknown"))
    : t("tasks:popover.assignee.unassigned");
  const avatar = (
    <AssigneeAvatar
      assigned={Boolean(value.userId)}
      name={value.name}
      image={null}
      className="size-4"
    />
  );
  const save = async (choice: ReleasePlanAssigneeChoice) => {
    if (blocked) return;
    setDraft(choice);
    if (await onSave(choice)) setOpen(false);
  };
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      {editable ? (
        <Popover
          open={open}
          onOpenChange={(next) => {
            if (saving || (next && disabled)) return;
            if (next && !error) setDraft(value);
            setOpen(next);
          }}
        >
          <PopoverTrigger
            disabled={blocked}
            aria-label={`${t("tasks:assignee.label")}: ${label}`}
            render={<Button type="button" variant="outline" size="xs" />}
          >
            {avatar}
            <span className="max-w-40 truncate" title={label}>
              {label}
            </span>
          </PopoverTrigger>
          <PopoverContent
            className="w-64 max-w-[calc(100vw-2rem)] p-0"
            align="start"
          >
            <PopoverTitle className="sr-only">
              {t("tasks:assignee.label")}
            </PopoverTitle>
            {members.isError ? (
              <div role="alert" className="space-y-2 p-3 text-sm">
                <p>{t("common:error.title")}</p>
                <Button
                  type="button"
                  variant="outline"
                  size="xs"
                  disabled={blocked}
                  onClick={() => void members.refetch()}
                >
                  {t("common:error.tryAgain")}
                </Button>
              </div>
            ) : (
              <div inert={blocked || undefined}>
                <OptionMenu
                  label={t("tasks:assignee.label")}
                  placeholder={t("tasks:bulk.assigneePlaceholder")}
                  options={assigneeMenuOptions(
                    members.data ?? [],
                    draft.userId,
                    t("tasks:popover.assignee.unassigned"),
                  )}
                  status={
                    members.isPending ? t("common:empty.loading") : undefined
                  }
                  onSelect={(userId) => {
                    if (blocked) return;
                    const member = members.data?.find(
                      (item) => item.id === userId,
                    );
                    void save({
                      userId: userId || null,
                      name: userId
                        ? member?.name || member?.email || null
                        : null,
                    });
                  }}
                />
              </div>
            )}
            {error && (
              <div className="space-y-2 border-t p-3">
                <p role="alert" className="text-xs text-destructive-foreground">
                  {error}
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="xs"
                  disabled={blocked}
                  onClick={() => void save(draft)}
                >
                  {t("common:error.tryAgain")}
                </Button>
              </div>
            )}
          </PopoverContent>
        </Popover>
      ) : (
        <span className="inline-flex min-h-7 min-w-0 items-center gap-1.5 text-xs text-muted-foreground sm:min-h-6">
          {avatar}
          <span className="max-w-40 truncate" title={label}>
            {label}
          </span>
        </span>
      )}
      {error && (!open || !editable) && (
        <p role="alert" className="text-xs text-destructive-foreground">
          {error}
        </p>
      )}
    </div>
  );
}
