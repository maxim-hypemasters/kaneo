import { format, parseISO } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { DatePickerMenu } from "@/components/common/date-picker/date-picker-menu";
import { formatPickerDay } from "@/components/common/date-picker/quick-date-labels";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/cn";
import { formatDateMedium } from "@/lib/format";

type MilestoneDateFieldProps = {
  kind: "start" | "end";
  value: string;
  onChange: (day: string) => void;
  disabled?: boolean;
  min?: string;
  max?: string;
  invalid?: boolean;
  errorId?: string;
};

export function MilestoneDateField({
  kind,
  value,
  onChange,
  disabled,
  min,
  max,
  invalid,
  errorId,
}: MilestoneDateFieldProps) {
  const { t } = useTranslation();
  const id = useId();
  const [open, setOpen] = useState(false);
  const label = t(
    kind === "start"
      ? "tasks:milestones.startDate"
      : "tasks:milestones.endDate",
  );
  const placeholder = t(
    kind === "start"
      ? "tasks:datePicker.startDatePlaceholder"
      : "tasks:milestones.endDatePlaceholder",
  );
  const selected = value ? parseISO(value) : null;
  const firstDay = min ? parseISO(min) : undefined;
  const lastDay = max ? parseISO(max) : undefined;
  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <Label htmlFor={id} className="text-sm font-normal">
        {label}
      </Label>
      <Popover open={open && !disabled} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <Button
              id={id}
              type="button"
              variant="outline"
              disabled={disabled}
              aria-label={label}
              aria-invalid={invalid || undefined}
              aria-describedby={errorId}
              title={selected ? formatDateMedium(selected) : undefined}
              className={cn(
                "w-full justify-start font-normal",
                !selected && "text-muted-foreground",
              )}
            />
          }
        >
          <CalendarIcon aria-hidden="true" className="size-4 shrink-0" />
          <span className="min-w-0 truncate">
            {selected ? formatDateMedium(selected) : placeholder}
          </span>
        </PopoverTrigger>
        <PopoverContent className="w-65 p-0" align="start">
          <DatePickerMenu
            label={label}
            placeholder={placeholder}
            clearLabel={t(
              kind === "start"
                ? "tasks:popover.startDate.clear"
                : "tasks:milestones.clearEndDate",
            )}
            value={selected}
            bounds={
              firstDay || lastDay
                ? { before: firstDay, after: lastDay }
                : undefined
            }
            formatLimit={(date) =>
              t(
                firstDay
                  ? "tasks:milestones.startsOn"
                  : "tasks:milestones.endsOn",
                { date },
              )
            }
            limitHint={
              firstDay && lastDay
                ? t("tasks:milestones.dateRange", {
                    start: formatPickerDay(firstDay),
                    end: formatPickerDay(lastDay),
                  })
                : undefined
            }
            onChange={(date) => {
              onChange(date ? format(date, "yyyy-MM-dd") : "");
              setOpen(false);
            }}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}
