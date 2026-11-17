import { useId } from "react";
import { useTranslation } from "react-i18next";
import { SettingsRow } from "@/components/settings/settings-row";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

type AssistantPrivacyFieldProps = {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
};

export function AssistantPrivacyField({
  checked,
  onCheckedChange,
}: AssistantPrivacyFieldProps) {
  const { t } = useTranslation();
  const id = useId();
  const descriptionId = useId();

  return (
    <SettingsRow
      className="flex-row items-center gap-6"
      titleClassName="whitespace-normal"
      title={
        <Label htmlFor={id}>{t("settings:assistantPage.privacy.label")}</Label>
      }
      description={
        <span id={descriptionId}>
          {t("settings:assistantPage.privacy.description")}
        </span>
      }
    >
      <Switch
        id={id}
        aria-describedby={descriptionId}
        checked={checked}
        onCheckedChange={onCheckedChange}
      />
    </SettingsRow>
  );
}
