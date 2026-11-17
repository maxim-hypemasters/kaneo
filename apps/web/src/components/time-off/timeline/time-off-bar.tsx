import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { TimeOffEntry, TimeOffRequest } from "@/fetchers/time-off/types";
import { cn } from "@/lib/cn";
import { formatReleaseRange } from "@/lib/releases/release-date";
import { isTimeOffRequest } from "@/lib/time-off/is-time-off-request";
import {
  AWAY_BAR_CLASS_NAME,
  TIME_OFF_BAR_BUTTON_CLASS_NAME,
  TIME_OFF_TYPE_STYLES,
} from "../time-off-type-styles";
import { TIME_OFF_STATUS_LABEL_KEYS } from "../time-off-status-labels";
import { TimeOffBarDetails } from "./time-off-bar-details";

export type TimeOffBarColumns = {
  // 1-based grid lines within the day columns (the rail comes first).
  lineStart: number;
  lineEnd: number;
  clippedStart: boolean;
  clippedEnd: boolean;
};

type TimeOffBarProps = {
  entry: TimeOffEntry;
  memberName: string;
  columns: TimeOffBarColumns;
  today: string;
  onEdit?: (request: TimeOffRequest) => void;
  onCancel?: (request: TimeOffRequest) => void;
};

// One stretch of time off. Other members' entries carry no type or status,
// so they show as a neutral "Away"; pending ones are dashed.
export function TimeOffBar({
  entry,
  memberName,
  columns,
  today,
  onEdit,
  onCancel,
}: TimeOffBarProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const request = isTimeOffRequest(entry) ? entry : null;
  const style = request ? TIME_OFF_TYPE_STYLES[request.type] : null;
  const Icon = style?.icon;
  const range = formatReleaseRange(entry.startDate, entry.endDate, { today });
  const text = style ? t(style.labelKey) : t("team:timeOff.timeline.away");
  const continued = [
    columns.clippedStart ? t("team:timeOff.timeline.clippedStart") : null,
    columns.clippedEnd ? t("team:timeOff.timeline.clippedEnd") : null,
  ].filter(Boolean);
  const label = [
    request
      ? t("team:timeOff.timeline.barLabelPrivate", {
          name: memberName,
          type: text,
          status: t(TIME_OFF_STATUS_LABEL_KEYS[request.status]),
          range,
          days: t("team:timeOff.weekdays", { count: request.days }),
        })
      : t("team:timeOff.timeline.barLabel", { name: memberName, range }),
    ...continued,
  ].join(". ");
  const triggerRef = useRef<HTMLButtonElement>(null);
  // Edit and Cancel close the popover and open a dialog. Focus goes back to
  // the bar first, so the dialog returns it there on close instead of to a
  // popover button that no longer exists.
  const handOff = (action?: (request: TimeOffRequest) => void) =>
    action
      ? (target: TimeOffRequest) => {
          triggerRef.current?.focus();
          setOpen(false);
          action(target);
        }
      : undefined;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          ref={triggerRef}
          type="button"
          aria-label={label}
          data-status={request?.status ?? "away"}
          data-clipped-start={columns.clippedStart || undefined}
          data-clipped-end={columns.clippedEnd || undefined}
          className={cn(
            TIME_OFF_BAR_BUTTON_CLASS_NAME,
            style ? style.barClassName : AWAY_BAR_CLASS_NAME,
            request?.status === "pending" &&
              "border-2 border-dashed bg-background/60",
            columns.clippedStart && "ml-0 rounded-l-none border-l-0",
            columns.clippedEnd && "mr-0 rounded-r-none border-r-0",
          )}
          style={{
            gridColumn: `${columns.lineStart + 1} / ${columns.lineEnd + 1}`,
            gridRow: 1,
          }}
        >
          {Icon ? (
            <Icon aria-hidden="true" className="size-3 shrink-0" />
          ) : null}
          <span aria-hidden="true" className="truncate">
            {text}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start">
        <TimeOffBarDetails
          entry={entry}
          memberName={memberName}
          today={today}
          onEdit={handOff(onEdit)}
          onCancel={handOff(onCancel)}
        />
      </PopoverContent>
    </Popover>
  );
}
