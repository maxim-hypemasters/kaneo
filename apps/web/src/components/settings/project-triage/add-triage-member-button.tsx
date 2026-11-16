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

type Candidate = {
  id: string;
  name?: string | null;
  email?: string | null;
  image?: string | null;
};

export function AddTriageMemberButton({
  candidates,
  loading,
  disabled,
  onAdd,
}: {
  candidates: Candidate[];
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
        render={<Button type="button" variant="outline" size="sm" />}
      >
        <UserPlus aria-hidden="true" />
        {t("settings:projectTriage.addMember")}
      </PopoverTrigger>
      <PopoverContent className="w-64 max-w-[calc(100vw-2rem)] p-0" align="end">
        <PopoverTitle className="sr-only">
          {t("settings:projectTriage.addMember")}
        </PopoverTitle>
        <OptionMenu
          label={t("settings:projectTriage.addMember")}
          placeholder={t("settings:projectTriage.searchPlaceholder")}
          options={options}
          status={
            loading
              ? t("common:empty.loading")
              : options.length === 0
                ? t("settings:projectTriage.noCandidates")
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
