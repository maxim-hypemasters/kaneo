import { useTranslation } from "react-i18next";
import { fieldDescribedBy } from "@/components/import/connect-forms/field-ids";
import {
  Autocomplete,
  AutocompleteCollection,
  AutocompleteEmpty,
  AutocompleteGroup,
  AutocompleteGroupLabel,
  AutocompleteInput,
  AutocompleteItem,
  AutocompleteList,
  AutocompletePopup,
  AutocompleteStatus,
} from "@/components/ui/autocomplete";
import type { AssistantModel } from "@/fetchers/assistant/get-assistant-models";
import { useAssistantModels } from "@/hooks/queries/assistant/use-assistant-models";
import { AssistantFieldRow } from "./assistant-field-row";
import {
  type AssistantModelGroup,
  groupAssistantModels,
  isListedModel,
  MODEL_LIST_LIMIT,
  matchesModelQuery,
} from "./assistant-model-options";
import { formatUsd } from "./format-usd";

const GROUP_LABEL_KEYS: Record<AssistantModelGroup["value"], string> = {
  recommended: "settings:assistantPage.form.recommended",
  all: "settings:assistantPage.form.allModels",
};

type AssistantModelFieldProps = {
  id: string;
  workspaceId: string;
  value: string;
  onValueChange: (value: string) => void;
  defaultModel: string;
  error: string | null;
};

// Free text on purpose: a model missing from the list (or a list that failed
// to load) can still be typed; the API checks it on save.
export function AssistantModelField({
  id,
  workspaceId,
  value,
  onValueChange,
  defaultModel,
  error,
}: AssistantModelFieldProps) {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage;
  const modelsQuery = useAssistantModels(workspaceId);
  const models = modelsQuery.data ?? [];
  const groups = groupAssistantModels(models);
  const showAll = isListedModel(models, value);
  const matchCount = showAll
    ? models.length
    : models.filter((model) => matchesModelQuery(model, value)).length;

  const price = (model: AssistantModel) =>
    model.promptPerMTokUsd === null || model.completionPerMTokUsd === null
      ? t("settings:assistantPage.form.priceUnknown")
      : t("settings:assistantPage.form.price", {
          input: formatUsd(model.promptPerMTokUsd, locale),
          output: formatUsd(model.completionPerMTokUsd, locale),
        });

  const emptyText = modelsQuery.isPending
    ? t("settings:assistantPage.form.modelsLoading")
    : modelsQuery.isError
      ? t("settings:assistantPage.form.modelsError")
      : t("settings:assistantPage.form.modelsNoMatch");

  return (
    <AssistantFieldRow
      id={id}
      label={t("settings:assistantPage.form.modelLabel")}
      error={error}
      description={
        <>
          <p>{t("settings:assistantPage.form.modelDescription")}</p>
          <p>
            {t("settings:assistantPage.form.modelDefault", {
              model: defaultModel,
            })}
          </p>
          {modelsQuery.isError ? (
            <p>{t("settings:assistantPage.form.modelsError")}</p>
          ) : null}
        </>
      }
    >
      <Autocomplete
        items={groups}
        value={value}
        onValueChange={onValueChange}
        itemToStringValue={(model) => model.id}
        filter={(model, query) => showAll || matchesModelQuery(model, query)}
        limit={MODEL_LIST_LIMIT}
        openOnInputClick
      >
        <AutocompleteInput
          id={id}
          size="sm"
          showTrigger
          placeholder={t("settings:assistantPage.form.modelPlaceholder")}
          autoCapitalize="off"
          spellCheck={false}
          aria-invalid={error ? true : undefined}
          aria-describedby={fieldDescribedBy(id, Boolean(error))}
        />
        <AutocompletePopup className="w-md">
          <AutocompleteEmpty>{emptyText}</AutocompleteEmpty>
          <AutocompleteList>
            {(group: AssistantModelGroup) => (
              <AutocompleteGroup key={group.value} items={group.items}>
                <AutocompleteGroupLabel>
                  {t(GROUP_LABEL_KEYS[group.value])}
                </AutocompleteGroupLabel>
                <AutocompleteCollection>
                  {(model: AssistantModel) => (
                    <AutocompleteItem key={model.id} value={model}>
                      <div className="flex min-w-0 flex-1 items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate">{model.name}</div>
                          <div className="truncate font-mono text-muted-foreground text-xs">
                            {model.id}
                          </div>
                        </div>
                        <span className="shrink-0 text-muted-foreground text-xs tabular-nums">
                          {price(model)}
                        </span>
                      </div>
                    </AutocompleteItem>
                  )}
                </AutocompleteCollection>
              </AutocompleteGroup>
            )}
          </AutocompleteList>
          <AutocompleteStatus>
            {matchCount > MODEL_LIST_LIMIT
              ? t("settings:assistantPage.form.modelsLimited", {
                  count: MODEL_LIST_LIMIT,
                  total: matchCount,
                })
              : null}
          </AutocompleteStatus>
        </AutocompletePopup>
      </Autocomplete>
    </AssistantFieldRow>
  );
}
