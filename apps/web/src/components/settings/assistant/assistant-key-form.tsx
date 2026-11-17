import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { SettingsCard } from "@/components/settings/settings-card";
import { Button } from "@/components/ui/button";
import type { AssistantSettings } from "@/fetchers/assistant/get-assistant-settings";
import { useSaveAssistantSettings } from "@/hooks/mutations/assistant/use-save-assistant-settings";
import { AssistantKeyField } from "./assistant-key-field";
import { hasReadableKey } from "./assistant-key-status";
import { AssistantModelField } from "./assistant-model-field";
import { AssistantPrivacyField } from "./assistant-privacy-field";
import {
  type AssistantSaveError,
  type AssistantSaveErrorField,
  getAssistantSaveError,
} from "./assistant-save-error";

type AssistantKeyFormProps = {
  workspaceId: string;
  settings: AssistantSettings;
};

export function AssistantKeyForm({
  workspaceId,
  settings,
}: AssistantKeyFormProps) {
  const { t } = useTranslation();
  const keyId = useId();
  const modelId = useId();
  const { mutateAsync, isPending } = useSaveAssistantSettings();
  // Never prefilled: the saved key never reaches the browser.
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState(settings.model);
  const [allowDataCollection, setAllowDataCollection] = useState(
    settings.allowDataCollection,
  );
  const [error, setError] = useState<AssistantSaveError | null>(null);
  const keySaved = hasReadableKey(settings);
  const canSubmit = model.trim() !== "" && (apiKey.trim() !== "" || keySaved);

  const submit = async () => {
    setError(null);
    const newKey = apiKey.trim();
    try {
      const saved = await mutateAsync({
        workspaceId,
        data: {
          // Leaving the field blank keeps the saved key.
          ...(newKey ? { apiKey: newKey } : {}),
          model: model.trim(),
          allowDataCollection,
        },
      });
      setApiKey("");
      setModel(saved.model);
      setAllowDataCollection(saved.allowDataCollection);
    } catch (caught) {
      setError(getAssistantSaveError(caught));
    }
  };

  const errorFor = (field: AssistantSaveErrorField) =>
    error?.field === field ? t(error.messageKey) : null;

  return (
    <form
      noValidate
      aria-label={t("settings:assistantPage.form.sectionTitle")}
      onSubmit={(event) => {
        event.preventDefault();
        if (canSubmit && !isPending) void submit();
      }}
    >
      <SettingsCard>
        <AssistantKeyField
          id={keyId}
          value={apiKey}
          onValueChange={setApiKey}
          savedKeyHint={keySaved ? settings.keyHint : null}
          unreadable={settings.keyState === "unreadable"}
          error={errorFor("apiKey")}
        />
        <AssistantModelField
          id={modelId}
          workspaceId={workspaceId}
          value={model}
          onValueChange={setModel}
          defaultModel={settings.defaultModel}
          error={errorFor("model")}
        />
        <AssistantPrivacyField
          checked={allowDataCollection}
          onCheckedChange={setAllowDataCollection}
        />
        <div className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-end">
          {error?.field === "form" ? (
            <p
              role="alert"
              className="text-xs text-destructive-foreground sm:mr-auto"
            >
              {t(error.messageKey)}
            </p>
          ) : null}
          <Button type="submit" size="sm" disabled={isPending || !canSubmit}>
            {isPending
              ? t("settings:assistantPage.form.saving")
              : settings.configured
                ? t("settings:assistantPage.form.save")
                : t("settings:assistantPage.form.connect")}
          </Button>
        </div>
      </SettingsCard>
    </form>
  );
}
