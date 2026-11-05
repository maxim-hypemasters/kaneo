import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { ReleaseDateField } from "@/components/releases/dialog/release-date-field";
import { releaseDateLimits } from "@/components/releases/dialog/release-date-limits";
import { Button } from "@/components/ui/button";
import {
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatReleaseDate } from "@/lib/releases/release-date";
import { useReleaseToday } from "@/lib/releases/use-release-today";
import type { Release } from "@/types/release";
import type {
  ReleasePlanChanges,
  ReleasePlanPreview,
} from "@/types/release-plan";
import { suggestedReleaseDates } from "./suggest-release-dates";

export function AdjustReleaseDatesForm({
  release,
  preview,
  changes,
  disabled,
  onSubmit,
}: {
  release: Release;
  preview: ReleasePlanPreview;
  changes: ReleasePlanChanges;
  disabled: boolean;
  onSubmit: (changes: ReleasePlanChanges) => void;
}) {
  const { t } = useTranslation();
  const today = useReleaseToday();
  const formId = useId();
  const [dates, setDates] = useState(() =>
    suggestedReleaseDates(release, changes, preview),
  );
  const valid =
    dates.startDate <= dates.codeFreezeDate &&
    dates.codeFreezeDate <= dates.submissionDate;
  return (
    <form
      id={formId}
      className="contents"
      onSubmit={(event) => {
        event.preventDefault();
        if (disabled || !valid) return;
        const { releaseDates: _oldDates, ...rest } = changes;
        onSubmit(
          dates.codeFreezeDate === release.codeFreezeDate &&
            dates.submissionDate === release.submissionDate
            ? rest
            : {
                ...rest,
                releaseDates: {
                  codeFreezeDate: dates.codeFreezeDate,
                  submissionDate: dates.submissionDate,
                },
              },
        );
      }}
    >
      <DialogHeader>
        <DialogTitle>
          {t("tasks:releases.planning.resolution.adjustDates")}
        </DialogTitle>
        <DialogDescription>
          {t("tasks:releases.planning.resolution.draftHelp")}
        </DialogDescription>
      </DialogHeader>
      <DialogPanel className="space-y-4">
        <p className="text-sm text-muted-foreground">
          {t("tasks:releases.dialog.startLabel")}:{" "}
          {formatReleaseDate(release.startDate, { today })}
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <ReleaseDateField
            kind="codeFreeze"
            value={dates.codeFreezeDate}
            limits={releaseDateLimits(dates, "codeFreeze")}
            today={today}
            disabled={disabled}
            onChange={(codeFreezeDate) =>
              setDates((current) => ({ ...current, codeFreezeDate }))
            }
          />
          <ReleaseDateField
            kind="submission"
            value={dates.submissionDate}
            limits={releaseDateLimits(dates, "submission")}
            today={today}
            disabled={disabled}
            onChange={(submissionDate) =>
              setDates((current) => ({ ...current, submissionDate }))
            }
          />
        </div>
        {!valid && (
          <p role="alert" className="text-sm text-destructive-foreground">
            {t("tasks:releases.planning.resolution.dateOrder")}
          </p>
        )}
      </DialogPanel>
      <DialogFooter>
        <Button type="submit" form={formId} disabled={disabled || !valid}>
          {t("tasks:releases.planning.resolution.updatePreview")}
        </Button>
      </DialogFooter>
    </form>
  );
}
