import { XIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { SettingsRow } from "@/components/settings/settings-row";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { getInitials } from "@/lib/get-initials";

export function TriageMemberRow({
  name,
  email,
  image,
  canEdit,
  disabled,
  onRemove,
}: {
  name: string;
  email?: string | null;
  image?: string | null;
  canEdit: boolean;
  disabled: boolean;
  onRemove: () => void;
}) {
  const { t } = useTranslation();
  return (
    <SettingsRow
      icon={
        <Avatar className="size-6">
          {image ? <AvatarImage src={image} alt="" /> : null}
          <AvatarFallback className="text-[9px]">
            {getInitials(name)}
          </AvatarFallback>
        </Avatar>
      }
      title={name}
      description={email && email !== name ? email : undefined}
    >
      {canEdit ? (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          disabled={disabled}
          onClick={onRemove}
          aria-label={t("settings:projectTriage.removeMember", { name })}
        >
          <XIcon aria-hidden="true" />
        </Button>
      ) : null}
    </SettingsRow>
  );
}
