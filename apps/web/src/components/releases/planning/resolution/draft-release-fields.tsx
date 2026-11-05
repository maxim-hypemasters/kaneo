import { addDays } from "date-fns";
import { useId } from "react";
import { useTranslation } from "react-i18next";
import { ReleaseDateField } from "@/components/releases/dialog/release-date-field";
import { releaseDateLimits } from "@/components/releases/dialog/release-date-limits";
import type { ReleaseFormValues } from "@/components/releases/dialog/release-form-values";
import type { ReleaseFormErrors } from "@/components/releases/dialog/validate-release";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  formatReleaseDate,
  parseReleaseDate,
  toReleaseDate,
} from "@/lib/releases/release-date";

export function DraftReleaseFields({
  values,
  errors,
  sourceStart,
  today,
  disabled,
  startTooEarly,
  onChange,
}: {
  values: ReleaseFormValues;
  errors: ReleaseFormErrors;
  sourceStart: string;
  today: string;
  disabled: boolean;
  startTooEarly: boolean;
  onChange: (values: ReleaseFormValues) => void;
}) {
  const { t } = useTranslation();
  const nameId = useId();
  const nameErrorId = useId();
  const errorText = (field: keyof ReleaseFormErrors) => {
    const error = errors[field];
    return error
      ? t(error.key, {
          date: error.day ? formatReleaseDate(error.day, { today }) : "",
        })
      : undefined;
  };
  return (
    <section
      className="flex flex-col gap-4"
      aria-label={t("tasks:releases.planning.resolution.createNext")}
    >
      <h3 className="text-sm font-medium">
        {t("tasks:releases.planning.resolution.createNext")}
      </h3>
      <p className="text-xs text-muted-foreground">
        {t("tasks:releases.planning.resolution.newReleaseHelp")}
      </p>
      <div className="space-y-2">
        <Label htmlFor={nameId}>{t("tasks:releases.dialog.nameLabel")}</Label>
        <Input
          id={nameId}
          value={values.name}
          maxLength={100}
          disabled={disabled}
          aria-invalid={Boolean(errors.name)}
          aria-describedby={errors.name ? nameErrorId : undefined}
          onChange={(event) =>
            onChange({ ...values, name: event.target.value })
          }
        />
        {errors.name && (
          <p id={nameErrorId} className="text-xs text-destructive-foreground">
            {errorText("name")}
          </p>
        )}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <ReleaseDateField
          kind="start"
          value={values.startDate}
          today={today}
          disabled={disabled}
          limits={{
            ...releaseDateLimits(values, "start"),
            min: {
              day: toReleaseDate(addDays(parseReleaseDate(sourceStart), 1)),
              kind: "start",
            },
          }}
          error={
            startTooEarly
              ? t("tasks:releases.planning.resolution.laterStart")
              : errorText("startDate")
          }
          onChange={(startDate) => onChange({ ...values, startDate })}
        />
        <ReleaseDateField
          kind="codeFreeze"
          value={values.codeFreezeDate}
          today={today}
          disabled={disabled}
          limits={releaseDateLimits(values, "codeFreeze")}
          error={errorText("codeFreezeDate")}
          onChange={(codeFreezeDate) => onChange({ ...values, codeFreezeDate })}
        />
        <ReleaseDateField
          kind="submission"
          value={values.submissionDate}
          today={today}
          disabled={disabled}
          limits={releaseDateLimits(values, "submission")}
          error={errorText("submissionDate")}
          onChange={(submissionDate) => onChange({ ...values, submissionDate })}
        />
      </div>
    </section>
  );
}
