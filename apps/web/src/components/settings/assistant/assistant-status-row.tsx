import { KeyRoundIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { SettingsRow } from "@/components/settings/settings-row";
import { StatusBadge } from "@/components/settings/status-badge";
import type { AssistantSettings } from "@/fetchers/assistant/get-assistant-settings";
import { formatDateMedium } from "@/lib/format";
import {
  ASSISTANT_KEY_STATUS_DISPLAY,
  getAssistantKeyStatus,
} from "./assistant-key-status";

type AssistantStatusRowProps = {
  settings: AssistantSettings;
};

export function AssistantStatusRow({ settings }: AssistantStatusRowProps) {
  const { t } = useTranslation();
  const display = ASSISTANT_KEY_STATUS_DISPLAY[getAssistantKeyStatus(settings)];

  return (
    <SettingsRow
      icon={<KeyRoundIcon />}
      title={t("settings:assistantPage.status.title")}
      badge={
        <StatusBadge tone={display.tone}>{t(display.labelKey)}</StatusBadge>
      }
      description={
        <>
          <p>{t(display.descriptionKey)}</p>
          {settings.configured && settings.updatedBy && settings.updatedAt ? (
            <p>
              {t("settings:assistantPage.status.updatedBy", {
                name: settings.updatedBy.name,
                date: formatDateMedium(settings.updatedAt),
              })}
            </p>
          ) : null}
        </>
      }
    />
  );
}
