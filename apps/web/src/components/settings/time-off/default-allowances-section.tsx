import { useId } from "react";
import { useTranslation } from "react-i18next";
import { SettingsCard } from "@/components/settings/settings-card";
import { SettingsRowsSkeleton } from "@/components/settings/settings-rows-skeleton";
import { SettingsSection } from "@/components/settings/settings-section";
import { TIME_OFF_TYPE_ORDER } from "@/components/time-off/time-off-type-styles";
import { useTimeOffAllowanceDefaults } from "@/hooks/queries/time-off/use-time-off-allowance-defaults";
import { DefaultAllowanceField } from "./default-allowance-field";
import { TimeOffSettingsLoadError } from "./time-off-settings-load-error";

type DefaultAllowancesSectionProps = {
  workspaceId: string;
  // False while permissions load; the section shows its skeleton meanwhile.
  enabled: boolean;
};

// The workspace default allowance of each type.
export function DefaultAllowancesSection({
  workspaceId,
  enabled,
}: DefaultAllowancesSectionProps) {
  const { t } = useTranslation();
  const hintId = useId();
  const defaults = useTimeOffAllowanceDefaults(workspaceId, { enabled });

  let content = <SettingsRowsSkeleton rows={TIME_OFF_TYPE_ORDER.length} />;
  if (defaults.data) {
    const value = defaults.data.defaultAllowances;
    content = (
      <>
        {TIME_OFF_TYPE_ORDER.map((type) => (
          <DefaultAllowanceField
            key={type}
            workspaceId={workspaceId}
            type={type}
            value={value[type]}
            describedBy={hintId}
          />
        ))}
      </>
    );
  } else if (defaults.isError) {
    content = (
      <TimeOffSettingsLoadError
        message={t("settings:workspaceTimeOff.loadError")}
        retrying={defaults.isFetching}
        onRetry={() => void defaults.refetch()}
      />
    );
  }

  return (
    <SettingsSection
      title={t("settings:workspaceTimeOff.defaultsTitle")}
      description={
        <span id={hintId}>
          {t("settings:workspaceTimeOff.defaultsDescription")}
        </span>
      }
    >
      <SettingsCard
        aria-busy={(!defaults.data && !defaults.isError) || undefined}
      >
        {content}
      </SettingsCard>
    </SettingsSection>
  );
}
