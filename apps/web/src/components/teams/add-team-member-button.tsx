import { UserPlus } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { OptionMenu } from "@/components/common/option-menu/option-menu";
import { assigneeMenuOptions } from "@/components/task/menus/assignee-menu-options";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { TeamMemberCandidate } from "./team-member-candidates";

export function AddTeamMemberButton({
  candidates,
  loading,
  disabled,
  onAdd,
}: {
  candidates: TeamMemberCandidate[];
  loading: boolean;
  disabled: boolean;
  onAdd: (userId: string) => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  // The menu's first option means "nobody", which has no place here.
  const options = assigneeMenuOptions(candidates, undefined, "").filter(
    (option) => option.value,
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        disabled={disabled}
        render={<Button type="button" variant="ghost" size="xs" />}
      >
        <UserPlus aria-hidden="true" />
        {t("teams:card.addMember")}
      </PopoverTrigger>
      <PopoverContent className="w-64 max-w-[calc(100vw-2rem)] p-0" align="end">
        <PopoverTitle className="sr-only">
          {t("teams:card.addMember")}
        </PopoverTitle>
        <OptionMenu
          label={t("teams:card.addMember")}
          placeholder={t("teams:card.searchMembers")}
          options={options}
          status={
            loading
              ? t("common:empty.loading")
              : options.length === 0
                ? t("teams:card.noMemberCandidates")
                : undefined
          }
          onSelect={(userId) => {
            if (!userId) return;
            setOpen(false);
            onAdd(userId);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
