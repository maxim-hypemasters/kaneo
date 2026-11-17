import type { OptionMenuItem } from "@/components/common/option-menu/option-menu-item";
import { UnassignedAvatar } from "@/components/common/unassigned-avatar";
import { WithAwayBadge } from "@/components/time-off/away/with-away-badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getInitials } from "@/lib/get-initials";

type AssignableMember = {
  id: string;
  name?: string | null;
  email?: string | null;
  image?: string | null;
};

// `away` maps a member id to "Away until Nov 20" for members away today; they
// get that hint and a badge on their avatar.
export function assigneeMenuOptions(
  members: AssignableMember[],
  current: string | null | undefined,
  unassignedLabel: string,
  away?: ReadonlyMap<string, string>,
): OptionMenuItem[] {
  return [
    {
      value: "",
      label: unassignedLabel,
      icon: <UnassignedAvatar className="size-4 text-[8px]" />,
      selected: current !== undefined && !current,
    },
    ...members.map((member) => {
      const awayLabel = away?.get(member.id);
      return {
        value: member.id,
        label: member.name || member.email || "",
        icon: (
          <WithAwayBadge
            label={awayLabel}
            decorative
            badgeClassName="size-2.5 ring-1"
          >
            <Avatar className="size-4">
              <AvatarImage src={member.image ?? ""} alt="" />
              <AvatarFallback className="text-[8px]">
                {getInitials(member.name)}
              </AvatarFallback>
            </Avatar>
          </WithAwayBadge>
        ),
        hint: awayLabel,
        selected: member.id === current,
      };
    }),
  ];
}
