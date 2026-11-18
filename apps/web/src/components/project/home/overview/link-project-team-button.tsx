import { Plus, UsersRound } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { OptionMenu } from "@/components/common/option-menu/option-menu";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { Team } from "@/fetchers/team/types";

export function LinkProjectTeamButton({
  candidates,
  hasTeams,
  loading,
  disabled,
  onLink,
}: {
  candidates: readonly Team[];
  hasTeams: boolean;
  loading: boolean;
  disabled: boolean;
  onLink: (teamId: string) => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const options = candidates.map((team) => ({
    value: team.id,
    label: team.name,
    icon: <UsersRound />,
    hint: t("teams:card.memberCount", { count: team.members.length }),
  }));

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        disabled={disabled}
        render={
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="w-full justify-start px-2 font-normal text-muted-foreground"
          />
        }
      >
        <Plus aria-hidden="true" />
        {t("teams:projectTeams.linkTeam")}
      </PopoverTrigger>
      <PopoverContent
        className="w-64 max-w-[calc(100vw-2rem)] p-0"
        align="start"
      >
        <PopoverTitle className="sr-only">
          {t("teams:projectTeams.linkTeam")}
        </PopoverTitle>
        <OptionMenu
          label={t("teams:projectTeams.linkTeam")}
          placeholder={t("teams:projectTeams.search")}
          options={options}
          status={
            loading
              ? t("common:empty.loading")
              : options.length > 0
                ? undefined
                : hasTeams
                  ? t("teams:projectTeams.allLinked")
                  : t("teams:projectTeams.noTeams")
          }
          onSelect={(teamId) => {
            if (!teamId) return;
            setOpen(false);
            onLink(teamId);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
