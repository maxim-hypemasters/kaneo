import { KeyRoundIcon } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ConfirmDialog } from "@/components/settings/confirm-dialog";
import { SettingsCard } from "@/components/settings/settings-card";
import { SettingsRow } from "@/components/settings/settings-row";
import { SettingsSection } from "@/components/settings/settings-section";
import { Button } from "@/components/ui/button";
import { useRotateAgentRunnerToken } from "@/hooks/mutations/agent/use-rotate-agent-runner-token";
import { RunnerTokenReveal } from "./runner-token-reveal";

type RunnerTokenSectionProps = {
  workspaceId: string;
  configured: boolean;
  token: string | null;
  onToken: (token: string) => void;
};

export function RunnerTokenSection({
  workspaceId,
  configured,
  token,
  onToken,
}: RunnerTokenSectionProps) {
  const { t } = useTranslation();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const { mutate, isPending } = useRotateAgentRunnerToken();

  const rotate = () =>
    mutate(workspaceId, {
      onSuccess: (result) => {
        onToken(result.token);
        setConfirmOpen(false);
      },
    });

  return (
    <SettingsSection
      title={t("settings:aiAgentPage.runner.token.sectionTitle")}
    >
      <SettingsCard>
        <SettingsRow
          stack
          icon={<KeyRoundIcon />}
          title={t("settings:aiAgentPage.runner.token.title")}
          description={t(
            configured
              ? "settings:aiAgentPage.runner.token.replaceDescription"
              : "settings:aiAgentPage.runner.token.createDescription",
          )}
        >
          <Button
            type="button"
            variant={configured ? "outline" : "default"}
            size="sm"
            loading={isPending && !confirmOpen}
            onClick={() => (configured ? setConfirmOpen(true) : rotate())}
          >
            {t(
              configured
                ? "settings:aiAgentPage.runner.token.replace"
                : "settings:aiAgentPage.runner.token.create",
            )}
          </Button>
        </SettingsRow>
        {token ? <RunnerTokenReveal token={token} /> : null}
      </SettingsCard>
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={t("settings:aiAgentPage.runner.token.replaceDialogTitle")}
        description={t(
          "settings:aiAgentPage.runner.token.replaceDialogDescription",
        )}
        confirmLabel={t("settings:aiAgentPage.runner.token.replace")}
        pendingLabel={t("settings:aiAgentPage.runner.token.replacing")}
        pending={isPending}
        onConfirm={rotate}
      />
    </SettingsSection>
  );
}
