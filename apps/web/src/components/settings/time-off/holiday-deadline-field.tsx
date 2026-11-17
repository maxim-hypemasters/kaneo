import { CalendarClock, CalendarDays } from "lucide-react";
import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { DatePickerMenu } from "@/components/common/date-picker/date-picker-menu";
import { errorMessage } from "@/components/project/error-message";
import { SettingsRow } from "@/components/settings/settings-row";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useSetTimeOffSettings } from "@/hooks/mutations/time-off/use-set-time-off-settings";
import { cn } from "@/lib/cn";
import {
  formatReleaseDate,
  parseReleaseDate,
  toReleaseDate,
} from "@/lib/releases/release-date";
import { useReleaseToday } from "@/lib/releases/use-release-today";
import { toast } from "@/lib/toast";

type HolidayDeadlineFieldProps = {
  workspaceId: string;
  // YYYY-MM-DD, or null for no deadline.
  value: string | null;
  // The section hint that explains the rule.
  describedBy?: string;
};

// The last day a member's first public holiday calendar choice applies
// without approval. Saved as soon as a day is picked or cleared.
export function HolidayDeadlineField({
  workspaceId,
  value,
  describedBy,
}: HolidayDeadlineFieldProps) {
  const { t } = useTranslation();
  const labelId = useId();
  const valueId = useId();
  const [open, setOpen] = useState(false);
  const today = useReleaseToday();
  const save = useSetTimeOffSettings(workspaceId);
  // The picked day shows while it saves; a failure falls back to the server's.
  const shown = save.isPending ? save.variables.holidayCalendarDeadline : value;

  const commit = async (deadline: string | null) => {
    if (deadline === value) return;
    try {
      await save.mutateAsync({ holidayCalendarDeadline: deadline });
      toast.success(
        deadline
          ? t("settings:workspaceTimeOff.deadlineSaved", {
              date: formatReleaseDate(deadline, { today }),
            })
          : t("settings:workspaceTimeOff.deadlineCleared"),
      );
    } catch (error) {
      toast.error(
        errorMessage(error, t("settings:workspaceTimeOff.deadlineSaveError")),
      );
    }
  };

  return (
    <SettingsRow
      stack
      icon={<CalendarClock />}
      title={
        <span id={labelId}>{t("settings:workspaceTimeOff.deadlineLabel")}</span>
      }
    >
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="sm"
            aria-labelledby={`${labelId} ${valueId}`}
            aria-describedby={describedBy}
            className={cn(
              "w-full justify-start font-normal sm:w-48",
              !shown && "text-muted-foreground",
            )}
          >
            <CalendarDays aria-hidden="true" />
            <span id={valueId} className="truncate">
              {shown
                ? formatReleaseDate(shown, { today })
                : t("settings:workspaceTimeOff.noDeadline")}
            </span>
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-65 p-0">
          <DatePickerMenu
            label={t("settings:workspaceTimeOff.deadlineLabel")}
            placeholder={t("tasks:datePicker.datePlaceholder")}
            clearLabel={t("settings:workspaceTimeOff.clearDeadline")}
            value={shown ? parseReleaseDate(shown) : null}
            canClear={shown !== null}
            onChange={(date) => {
              setOpen(false);
              void commit(date ? toReleaseDate(date) : null);
            }}
          />
        </PopoverContent>
      </Popover>
    </SettingsRow>
  );
}
