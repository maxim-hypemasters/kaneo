import { useState } from "react";
import { useTranslation } from "react-i18next";
import { SettingsCard } from "@/components/settings/settings-card";
import { SettingsRow } from "@/components/settings/settings-row";
import { SettingsSection } from "@/components/settings/settings-section";
import { Button } from "@/components/ui/button";
import { RemoveAssistantKeyDialog } from "./remove-assistant-key-dialog";

type AssistantRemoveKeySectionProps = {
  workspaceId: string;
};

export function AssistantRemoveKeySection({
  workspaceId,
}: AssistantRemoveKeySectionProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  return (
    <SettingsSection title={t("settings:assistantPage.remove.sectionTitle")}>
      <SettingsCard tone="danger">
        <SettingsRow
          stack
          title={t("settings:assistantPage.remove.title")}
          description={t("settings:assistantPage.remove.description")}
        >
          <Button
            type="button"
            variant="destructive-outline"
            size="sm"
            onClick={() => setOpen(true)}
          >
            {t("settings:assistantPage.remove.button")}
          </Button>
        </SettingsRow>
      </SettingsCard>
      <RemoveAssistantKeyDialog
        workspaceId={workspaceId}
        open={open}
        onOpenChange={setOpen}
      />
    </SettingsSection>
  );
}
