import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { DeliveryActiveRow } from "@/components/project/integrations/delivery-panel/delivery-active-row";
import { IntegrationPanel } from "@/components/project/integrations/panel/integration-panel";
import { IntegrationPanelFooter } from "@/components/project/integrations/panel/integration-panel-footer";
import { IntegrationPanelSection } from "@/components/project/integrations/panel/integration-panel-section";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { ProjectAgentSettings } from "@/fetchers/agent/get-project-agent-settings";
import { useSaveProjectAgentSettings } from "@/hooks/mutations/agent/use-save-project-agent-settings";
import {
  type AgentSettingsFormErrors,
  type AgentSettingsFormValues,
  INSTRUCTIONS_MAX_LENGTH,
  toAgentSettingsFormValues,
  toAgentSettingsInput,
  validateAgentSettings,
} from "./agent-settings-form";
import { RunnerMissingNote } from "./runner-missing-note";

type AiAgentSettingsFormProps = {
  projectId: string;
  settings: ProjectAgentSettings;
};

export function AiAgentSettingsForm({
  projectId,
  settings,
}: AiAgentSettingsFormProps) {
  const { t } = useTranslation();
  const [values, setValues] = useState<AgentSettingsFormValues>(() =>
    toAgentSettingsFormValues(settings),
  );
  const [errors, setErrors] = useState<AgentSettingsFormErrors>({});
  const { mutate, isPending } = useSaveProjectAgentSettings();
  const suggested = settings.suggestedRepository;

  const set = <K extends keyof AgentSettingsFormValues>(
    key: K,
    value: AgentSettingsFormValues[K],
  ) => {
    setValues((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const found = validateAgentSettings(values);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    mutate({ projectId, data: toAgentSettingsInput(values) });
  };

  return (
    <form noValidate onSubmit={submit}>
      <IntegrationPanel>
        <IntegrationPanelSection className="space-y-4">
          {settings.runnerConfigured ? null : <RunnerMissingNote />}
          <DeliveryActiveRow
            title={t("settings:aiAgentPage.project.enabledTitle")}
            description={t("settings:aiAgentPage.project.enabledDescription")}
            checked={values.enabled}
            disabled={isPending}
            onCheckedChange={(checked) => set("enabled", checked)}
          />
          <DeliveryActiveRow
            title={t("settings:aiAgentPage.project.autoAssessTitle")}
            description={t(
              "settings:aiAgentPage.project.autoAssessDescription",
            )}
            checked={values.autoAssess}
            disabled={isPending}
            onCheckedChange={(checked) => set("autoAssess", checked)}
          />
          <div className="grid gap-3 sm:grid-cols-3">
            <Field
              className="gap-1.5 sm:col-span-2"
              invalid={Boolean(errors.repository)}
            >
              <FieldLabel>
                {t("settings:aiAgentPage.project.repositoryLabel")}
              </FieldLabel>
              <Input
                value={values.repository}
                placeholder={
                  suggested ??
                  t("settings:aiAgentPage.project.repositoryPlaceholder")
                }
                autoComplete="off"
                spellCheck={false}
                onChange={(event) => set("repository", event.target.value)}
              />
              {errors.repository ? (
                <FieldError match>{t(errors.repository)}</FieldError>
              ) : (
                <FieldDescription>
                  {suggested && !values.repository.trim()
                    ? t("settings:aiAgentPage.project.repositoryFromGithub", {
                        repository: suggested,
                      })
                    : t("settings:aiAgentPage.project.repositoryHint")}
                </FieldDescription>
              )}
            </Field>
            <Field className="gap-1.5" invalid={Boolean(errors.baseBranch)}>
              <FieldLabel>
                {t("settings:aiAgentPage.project.baseBranchLabel")}
              </FieldLabel>
              <Input
                value={values.baseBranch}
                autoComplete="off"
                spellCheck={false}
                onChange={(event) => set("baseBranch", event.target.value)}
              />
              {errors.baseBranch ? (
                <FieldError match>{t(errors.baseBranch)}</FieldError>
              ) : null}
            </Field>
          </div>
          <Field className="gap-1.5" invalid={Boolean(errors.readyThreshold)}>
            <FieldLabel>
              {t("settings:aiAgentPage.project.thresholdLabel")}
            </FieldLabel>
            <Input
              type="number"
              inputMode="numeric"
              min={1}
              max={100}
              step={1}
              className="w-24"
              value={values.readyThreshold}
              onChange={(event) => set("readyThreshold", event.target.value)}
            />
            {errors.readyThreshold ? (
              <FieldError match>{t(errors.readyThreshold)}</FieldError>
            ) : (
              <FieldDescription>
                {t("settings:aiAgentPage.project.thresholdHint")}
              </FieldDescription>
            )}
          </Field>
          <Field className="gap-1.5">
            <FieldLabel>
              {t("settings:aiAgentPage.project.instructionsLabel")}
            </FieldLabel>
            <Textarea
              value={values.instructions}
              maxLength={INSTRUCTIONS_MAX_LENGTH}
              rows={4}
              placeholder={t(
                "settings:aiAgentPage.project.instructionsPlaceholder",
              )}
              onChange={(event) => set("instructions", event.target.value)}
            />
            <FieldDescription>
              {t("settings:aiAgentPage.project.instructionsHint")}
            </FieldDescription>
          </Field>
        </IntegrationPanelSection>
        <IntegrationPanelFooter>
          <Button type="submit" size="sm" loading={isPending}>
            {t("settings:aiAgentPage.project.save")}
          </Button>
        </IntegrationPanelFooter>
      </IntegrationPanel>
    </form>
  );
}
