import { useId } from "react";
import { useTranslation } from "react-i18next";
import { SettingsCard } from "@/components/settings/settings-card";
import { SettingsRowsSkeleton } from "@/components/settings/settings-rows-skeleton";
import { SettingsSection } from "@/components/settings/settings-section";
import { useTimeOffSettings } from "@/hooks/queries/time-off/use-time-off-settings";
import { HolidayDeadlineField } from "./holiday-deadline-field";
import { TimeOffSettingsLoadError } from "./time-off-settings-load-error";

type HolidayDeadlineSectionProps = {
  workspaceId: string;
  // False while permissions load; the section shows its skeleton meanwhile.
  enabled: boolean;
};

// Public holidays: the deadline for members' free first calendar choice.
export function HolidayDeadlineSection({
  workspaceId,
  enabled,
}: HolidayDeadlineSectionProps) {
  const { t } = useTranslation();
  const hintId = useId();
  const settings = useTimeOffSettings(workspaceId, { enabled });

  let content = <SettingsRowsSkeleton rows={1} />;
  if (settings.data) {
    content = (
      <HolidayDeadlineField
        workspaceId={workspaceId}
        value={settings.data.holidayCalendarDeadline}
        describedBy={hintId}
      />
    );
  } else if (settings.isError) {
    content = (
      <TimeOffSettingsLoadError
        message={t("settings:workspaceTimeOff.deadlineLoadError")}
        retrying={settings.isFetching}
        onRetry={() => void settings.refetch()}
      />
    );
  }

  return (
    <SettingsSection
      title={t("settings:workspaceTimeOff.holidaysTitle")}
      description={
        <span id={hintId}>
          {t("settings:workspaceTimeOff.holidaysDescription")}
        </span>
      }
    >
      <SettingsCard
        aria-busy={(!settings.data && !settings.isError) || undefined}
      >
        {content}
      </SettingsCard>
    </SettingsSection>
  );
}
