import { useTranslation } from "react-i18next";
import { PopoverDescription, PopoverTitle } from "@/components/ui/popover";

type TimeOffHolidayDetailsProps = {
  memberName: string;
  date: string;
  // Undefined where the viewer may not see it.
  holidayName?: string;
};

// A holiday bar's popover. Without a name it reads like private time off.
export function TimeOffHolidayDetails({
  memberName,
  date,
  holidayName,
}: TimeOffHolidayDetailsProps) {
  const { t } = useTranslation();

  return (
    <div className="flex w-72 max-w-full flex-col gap-3 p-3">
      <div className="flex flex-col gap-1">
        <PopoverTitle className="truncate text-sm">{memberName}</PopoverTitle>
        <PopoverDescription className="text-xs">{date}</PopoverDescription>
      </div>
      {holidayName ? (
        <p className="text-sm">
          {t("team:timeOff.timeline.holidayNamed", { name: holidayName })}
        </p>
      ) : (
        <p className="text-muted-foreground text-xs">
          {t("team:timeOff.details.private", { name: memberName })}
        </p>
      )}
    </div>
  );
}
