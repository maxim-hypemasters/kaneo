import { useId } from "react";
import { useTranslation } from "react-i18next";
import { errorMessage } from "@/components/project/error-message";
import { SettingsRow } from "@/components/settings/settings-row";
import { AllowanceDaysInput } from "@/components/time-off/balances/allowance-days-input";
import { TIME_OFF_TYPE_STYLES } from "@/components/time-off/time-off-type-styles";
import type { TimeOffType } from "@/fetchers/time-off/types";
import { useSetDefaultTimeOffAllowance } from "@/hooks/mutations/time-off/use-set-default-time-off-allowance";
import { toast } from "@/lib/toast";

type DefaultAllowanceFieldProps = {
  workspaceId: string;
  type: TimeOffType;
  value: number;
  // The hint shared by every default field.
  describedBy?: string;
};

// One type's allowance for every member without one of their own, saved
// when the field is left.
export function DefaultAllowanceField({
  workspaceId,
  type,
  value,
  describedBy,
}: DefaultAllowanceFieldProps) {
  const { t } = useTranslation();
  const inputId = useId();
  const unitId = useId();
  const setDefault = useSetDefaultTimeOffAllowance(workspaceId);
  const style = TIME_OFF_TYPE_STYLES[type];
  const Icon = style.icon;
  const label = t(style.labelKey);

  const save = async (days: number | null) => {
    if (days === null) return;
    try {
      await setDefault.mutateAsync({ type, days });
      toast.success(
        t("settings:workspaceTimeOff.defaultSaved", {
          type: label,
          count: days,
        }),
      );
    } catch (error) {
      toast.error(
        errorMessage(error, t("settings:workspaceTimeOff.saveError")),
      );
    }
  };

  return (
    <SettingsRow
      stack
      icon={<Icon />}
      iconClassName={style.iconClassName}
      title={<label htmlFor={inputId}>{label}</label>}
    >
      {/* Wraps the unit below a long validation message on narrow screens. */}
      <div className="flex flex-wrap items-start gap-x-2">
        <AllowanceDaysInput
          id={inputId}
          value={value}
          className="w-20"
          aria-describedby={
            [unitId, describedBy].filter(Boolean).join(" ") || undefined
          }
          onCommit={save}
        />
        <span
          id={unitId}
          className="text-muted-foreground text-sm leading-8 sm:leading-7"
        >
          {t("settings:workspaceTimeOff.perYear")}
        </span>
      </div>
    </SettingsRow>
  );
}
