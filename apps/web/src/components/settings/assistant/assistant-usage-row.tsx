import { GaugeIcon, TriangleAlertIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { SettingsRow } from "@/components/settings/settings-row";
import { Skeleton } from "@/components/ui/skeleton";
import { useAssistantKeyUsage } from "@/hooks/queries/assistant/use-assistant-key-usage";
import { AssistantExternalLink } from "./assistant-external-link";
import { OPENROUTER_KEY_SETTINGS_URL } from "./assistant-links";
import { formatUsd } from "./format-usd";

type AssistantUsageRowProps = {
  workspaceId: string;
};

// Loads on its own after the settings, so a slow or failing OpenRouter never
// holds up the page.
export function AssistantUsageRow({ workspaceId }: AssistantUsageRowProps) {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage;
  const usageQuery = useAssistantKeyUsage(workspaceId);

  const renderDescription = () => {
    if (usageQuery.isPending) {
      return (
        <>
          <Skeleton aria-hidden="true" className="mt-1 h-3 w-44" />
          <span className="sr-only">
            {t("settings:assistantPage.usage.loading")}
          </span>
        </>
      );
    }
    if (usageQuery.isError) {
      return (
        <p role="alert">
          {usageQuery.keyRejected
            ? t("settings:assistantPage.usage.keyRejected")
            : t("settings:assistantPage.usage.loadError")}
        </p>
      );
    }

    const usage = usageQuery.data;
    const used = formatUsd(usage.usageUsd, locale);
    if (usage.limitUsd !== null) {
      return (
        <p>
          {t("settings:assistantPage.usage.limited", {
            used,
            limit: formatUsd(usage.limitUsd, locale),
          })}
        </p>
      );
    }

    return (
      <>
        <p>{t("settings:assistantPage.usage.unlimited", { used })}</p>
        <p className="mt-1 flex items-start gap-1.5 text-warning-foreground">
          <TriangleAlertIcon
            aria-hidden="true"
            className="mt-px size-3.5 shrink-0"
          />
          <span>
            {t("settings:assistantPage.usage.noLimitWarning")}{" "}
            <AssistantExternalLink href={OPENROUTER_KEY_SETTINGS_URL}>
              {t("settings:assistantPage.usage.setLimit")}
            </AssistantExternalLink>
          </span>
        </p>
      </>
    );
  };

  return (
    <SettingsRow
      icon={<GaugeIcon />}
      title={t("settings:assistantPage.usage.title")}
      description={renderDescription()}
    />
  );
}
