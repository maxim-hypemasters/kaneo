import { useTranslation } from "react-i18next";
import { SettingsCard } from "@/components/settings/settings-card";
import { SettingsSection } from "@/components/settings/settings-section";
import { CopyTextButton } from "./copy-text-button";
import { resolveRunnerApiUrl, runnerEnvSnippet } from "./runner-env";

type RunnerEnvSnippetProps = {
  /** The new token while it is still shown; otherwise a placeholder. */
  token: string | null;
};

export function RunnerEnvSnippet({ token }: RunnerEnvSnippetProps) {
  const { t } = useTranslation();
  const apiUrl = resolveRunnerApiUrl(
    import.meta.env.VITE_API_URL,
    window.location.origin,
  );
  const snippet = runnerEnvSnippet(
    apiUrl,
    token ?? t("settings:aiAgentPage.runner.env.tokenPlaceholder"),
  );

  return (
    <SettingsSection
      title={t("settings:aiAgentPage.runner.env.title")}
      description={t("settings:aiAgentPage.runner.env.description")}
    >
      <SettingsCard>
        <div className="flex items-start gap-2 px-4 py-3.5">
          <pre className="min-w-0 flex-1 overflow-x-auto font-mono text-xs leading-5">
            {snippet}
          </pre>
          <CopyTextButton
            text={snippet}
            label={t("settings:aiAgentPage.runner.env.copyLabel")}
          />
        </div>
      </SettingsCard>
    </SettingsSection>
  );
}
