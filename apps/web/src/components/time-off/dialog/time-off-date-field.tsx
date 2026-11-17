import { CalendarDays } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { DatePickerMenu } from "@/components/common/date-picker/date-picker-menu";
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

type TimeOffDateFieldProps = {
  label: string;
  value: string | null;
  // The first and last days the picker allows, YYYY-MM-DD.
  min?: string;
  max?: string;
  // The hint under the calendar for the lower bound; `date` is formatted.
  formatLimit?: (date: string) => string;
  outOfRangeLabel?: (side: "before" | "after", date: string) => string;
  error?: string;
  today: string;
  disabled?: boolean;
  onChange: (day: string) => void;
};

export function TimeOffDateField({
  label,
  value,
  min,
  max,
  formatLimit,
  outOfRangeLabel,
  error,
  today,
  disabled = false,
  onChange,
}: TimeOffDateFieldProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);
  const buttonId = useId();
  const labelId = useId();
  const valueId = useId();
  const errorId = useId();

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <Label id={labelId} htmlFor={buttonId}>
        {label}
      </Label>
      <Popover
        open={open && !disabled}
        onOpenChange={(next) => !disabled && setOpen(next)}
      >
        <PopoverTrigger asChild>
          <Button
            id={buttonId}
            type="button"
            disabled={disabled}
            variant="outline"
            aria-labelledby={`${labelId} ${valueId}`}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
            className={cn(
              "w-full justify-start font-normal aria-invalid:border-destructive/36",
              !value && "text-muted-foreground",
            )}
          >
            <CalendarDays aria-hidden="true" />
            <span id={valueId} className="truncate">
              {value
                ? formatReleaseDate(value, { today })
                : t("team:timeOff.dialog.pickDate")}
            </span>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-65 p-0" align="start">
          <DatePickerMenu
            label={label}
            placeholder={t("tasks:datePicker.datePlaceholder")}
            clearLabel={t("team:timeOff.dialog.pickDate")}
            canClear={false}
            value={value ? parseReleaseDate(value) : null}
            onChange={(date) => {
              if (!date) return;
              onChange(toReleaseDate(date));
              setOpen(false);
            }}
            bounds={{
              before: min ? parseReleaseDate(min) : undefined,
              after: max ? parseReleaseDate(max) : undefined,
            }}
            formatLimit={formatLimit}
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
