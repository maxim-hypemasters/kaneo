import { useTranslation } from "react-i18next";
import { SecretInput } from "@/components/import/connect-forms/secret-input";
import { AssistantExternalLink } from "./assistant-external-link";
import { AssistantFieldRow } from "./assistant-field-row";
import { OPENROUTER_KEYS_URL } from "./assistant-links";

type AssistantKeyFieldProps = {
  id: string;
  value: string;
  onValueChange: (value: string) => void;
  // The saved key's hint while it can still be used; null when a key must be
  // entered.
  savedKeyHint: string | null;
  unreadable: boolean;
  error: string | null;
};

// The key is write-only: the input starts empty, and blank keeps the saved
// key.
export function AssistantKeyField({
  id,
  value,
  onValueChange,
  savedKeyHint,
  unreadable,
  error,
}: AssistantKeyFieldProps) {
  const { t } = useTranslation();
  const label = t("settings:assistantPage.form.keyLabel");

  const hint = savedKeyHint
    ? t("settings:assistantPage.form.keyHintSaved", { hint: savedKeyHint })
    : unreadable
      ? t("settings:assistantPage.form.keyHintUnreadable")
      : t("settings:assistantPage.form.keyHintRequired");

  return (
    <AssistantFieldRow
      id={id}
      label={label}
      error={error}
      description={
        <>
          <p>{hint}</p>
          <p>
            <AssistantExternalLink href={OPENROUTER_KEYS_URL}>
              {t("settings:assistantPage.form.getKey")}
            </AssistantExternalLink>
          </p>
        </>
      }
    >
      <SecretInput
        id={id}
        label={label}
        value={value}
        onValueChange={onValueChange}
        placeholder={t("settings:assistantPage.form.keyPlaceholder")}
        invalid={Boolean(error)}
      />
    </AssistantFieldRow>
  );
}
