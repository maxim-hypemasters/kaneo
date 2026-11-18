import { XIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import type { TeamMember } from "@/fetchers/team/types";
import { getInitials } from "@/lib/get-initials";

export function TeamMemberRow({
  member,
  canEdit,
  disabled,
  onRemove,
}: {
  member: TeamMember;
  canEdit: boolean;
  disabled: boolean;
  onRemove: () => void;
}) {
  const { t } = useTranslation();
  const name = member.name || member.email;
  return (
    <li className="flex min-h-9 items-center gap-2.5 px-4 py-1">
      <Avatar className="size-6">
        {member.image ? <AvatarImage src={member.image} alt="" /> : null}
        <AvatarFallback className="text-[9px]">
          {getInitials(name)}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm">{name}</p>
        {member.name && member.email !== member.name ? (
          <p className="truncate text-xs text-muted-foreground">
            {member.email}
          </p>
        ) : null}
      </div>
      {canEdit ? (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          disabled={disabled}
          onClick={onRemove}
          aria-label={t("teams:card.removeMember", { name })}
        >
          <XIcon aria-hidden="true" />
        </Button>
      ) : null}
    </li>
  );
}
