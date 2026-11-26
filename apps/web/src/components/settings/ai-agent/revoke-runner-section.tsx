import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ConfirmDialog } from "@/components/settings/confirm-dialog";
import { SettingsCard } from "@/components/settings/settings-card";
import { SettingsRow } from "@/components/settings/settings-row";
import { SettingsSection } from "@/components/settings/settings-section";
import { Button } from "@/components/ui/button";
import { useRevokeAgentRunner } from "@/hooks/mutations/agent/use-revoke-agent-runner";

type RevokeRunnerSectionProps = {
  workspaceId: string;
  onRevoked: () => void;
};

export function RevokeRunnerSection({
  workspaceId,
  onRevoked,
}: RevokeRunnerSectionProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const { mutate, isPending } = useRevokeAgentRunner();

  const revoke = () =>
    mutate(workspaceId, {
      onSuccess: () => {
        setOpen(false);
        onRevoked();
      },
    });

  return (
    <SettingsSection
      title={t("settings:aiAgentPage.runner.revoke.sectionTitle")}
    >
      <SettingsCard tone="danger">
        <SettingsRow
          stack
          title={t("settings:aiAgentPage.runner.revoke.title")}
          description={t("settings:aiAgentPage.runner.revoke.description")}
        >
          <Button
            type="button"
            variant="destructive-outline"
            size="sm"
            onClick={() => setOpen(true)}
          >
            {t("settings:aiAgentPage.runner.revoke.button")}
          </Button>
        </SettingsRow>
      </SettingsCard>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={t("settings:aiAgentPage.runner.revoke.dialogTitle")}
        description={t("settings:aiAgentPage.runner.revoke.dialogDescription")}
        confirmLabel={t("settings:aiAgentPage.runner.revoke.button")}
        pendingLabel={t("settings:aiAgentPage.runner.revoke.revoking")}
        pending={isPending}
        onConfirm={revoke}
      />
    </SettingsSection>
  );
}
