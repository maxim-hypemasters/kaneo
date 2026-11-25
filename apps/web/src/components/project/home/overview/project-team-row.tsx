import { UsersRound, XIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import type { Team } from "@/fetchers/team/types";

export function ProjectTeamRow({
  team,
  canEdit,
  disabled,
  onUnlink,
}: {
  team: Team;
  canEdit: boolean;
  disabled: boolean;
  onUnlink: () => void;
}) {
  const { t } = useTranslation();
  return (
    <li className="flex h-8 min-w-0 items-center gap-2 rounded-md pr-1 pl-2">
      <UsersRound
        aria-hidden="true"
        className="size-3.5 shrink-0 text-muted-foreground"
      />
      <span className="min-w-0 flex-1 truncate font-medium text-[13px]">
        {team.name}
      </span>
      <span className="shrink-0 text-muted-foreground text-xs tabular-nums">
        {t("teams:card.memberCount", { count: team.members.length })}
      </span>
      {canEdit ? (
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          disabled={disabled}
          onClick={onUnlink}
          aria-label={t("teams:projectTeams.unlink", { name: team.name })}
          className="text-muted-foreground"
        >
          <XIcon aria-hidden="true" />
        </Button>
      ) : null}
    </li>
  );
}
