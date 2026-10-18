import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { DatePickerMenu } from "@/components/common/date-picker/date-picker-menu";
import { formatPickerDay } from "@/components/common/date-picker/quick-date-labels";
import { RELEASE_DATE_KINDS } from "@/components/releases/release-date-kinds";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/cn";
import {
  formatReleaseDate,
  parseReleaseDate,
  toReleaseDate,
} from "@/lib/releases/release-date";
import type { ReleaseDateKind } from "@/types/release";
import type { ReleaseDateLimits } from "./release-date-limits";

const LABEL_KEYS = {
  start: "tasks:releases.dialog.startLabel",
  codeFreeze: "tasks:releases.dialog.codeFreezeLabel",
  submission: "tasks:releases.dialog.submissionLabel",
} as const satisfies Record<ReleaseDateKind, string>;

const LIMIT_KEYS = {
  start: "tasks:releases.pages.limit.start",
  codeFreeze: "tasks:releases.pages.limit.codeFreeze",
  submission: "tasks:releases.pages.limit.submission",
} as const satisfies Record<ReleaseDateKind, string>;

type ReleaseDateFieldProps = {
  kind: ReleaseDateKind;
  value: string | null;
  limits: ReleaseDateLimits;
  error?: string;
  today: string;
  onChange: (day: string) => void;
};

export function ReleaseDateField({
  kind,
  value,
  limits,
  error,
  today,
  onChange,
}: ReleaseDateFieldProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const buttonId = useId();
  const labelId = useId();
  const valueId = useId();
  const errorId = useId();
  const style = RELEASE_DATE_KINDS[kind];
  const Icon = style.icon;
  const label = t(LABEL_KEYS[kind]);
  const { min, max } = limits;

  const outOfRangeLabel = (side: "before" | "after", date: string) => {
    if (side === "before") {
      return t(
        min?.kind === "codeFreeze"
          ? "tasks:releases.dialog.beforeCodeFreeze"
          : "tasks:releases.dialog.beforeStart",
        { date },
      );
    }
    return t(
      max?.kind === "codeFreeze"
        ? "tasks:releases.dialog.afterCodeFreeze"
        : "tasks:releases.dialog.afterSubmission",
      { date },
    );
  };
  const single = min ?? max;
  const limitHint =
    min && max
      ? t("tasks:releases.dialog.limitHint", {
          start: formatPickerDay(parseReleaseDate(min.day)),
          end: formatPickerDay(parseReleaseDate(max.day)),
        })
      : undefined;

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <Label id={labelId} htmlFor={buttonId}>
        {label}
      </Label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id={buttonId}
            type="button"
            variant="outline"
            aria-labelledby={`${labelId} ${valueId}`}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
            className={cn(
              "w-full justify-start font-normal aria-invalid:border-destructive/36",
              !value && "text-muted-foreground",
            )}
          >
            <Icon aria-hidden="true" className={style.iconClassName} />
            <span id={valueId} className="truncate">
              {value
                ? formatReleaseDate(value, { today })
                : t("tasks:releases.dialog.pickDate")}
            </span>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-65 p-0" align="start">
          <DatePickerMenu
            label={label}
            placeholder={t("tasks:datePicker.datePlaceholder")}
            clearLabel={t("tasks:releases.dialog.pickDate")}
            canClear={false}
            value={value ? parseReleaseDate(value) : null}
            onChange={(date) => {
              if (!date) return;
              onChange(toReleaseDate(date));
              setOpen(false);
            }}
            bounds={{
              before: min ? parseReleaseDate(min.day) : undefined,
              after: max ? parseReleaseDate(max.day) : undefined,
            }}
            formatLimit={
              single
                ? (date) => t(LIMIT_KEYS[single.kind], { date })
                : undefined
            }
            limitHint={limitHint}
            outOfRangeLabel={outOfRangeLabel}
          />
        </PopoverContent>
      </Popover>
      {error ? (
        <p id={errorId} className="text-destructive-foreground text-xs">
          {error}
        </p>
      ) : null}
    </div>
  );
}
