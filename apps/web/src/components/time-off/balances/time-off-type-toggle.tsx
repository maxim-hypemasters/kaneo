import { useTranslation } from "react-i18next";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { TimeOffType } from "@/fetchers/time-off/types";
import { cn } from "@/lib/cn";
import {
  TIME_OFF_TYPE_ORDER,
  TIME_OFF_TYPE_STYLES,
} from "../time-off-type-styles";

type TimeOffTypeToggleProps = {
  value: TimeOffType;
  onChange: (type: TimeOffType) => void;
};

// Picks the type whose allowances and day counts the balances table shows.
export function TimeOffTypeToggle({ value, onChange }: TimeOffTypeToggleProps) {
  const { t } = useTranslation();

  return (
    <ToggleGroup
      aria-label={t("team:timeOff.balances.typeLabel")}
      value={[value]}
      onValueChange={([next]) => {
        const type = TIME_OFF_TYPE_ORDER.find((option) => option === next);
        if (type) onChange(type);
      }}
      className="h-9 w-full rounded-lg border border-input bg-background p-0.5 sm:h-8 sm:w-auto dark:bg-input/32"
    >
      {TIME_OFF_TYPE_ORDER.map((type) => {
        const style = TIME_OFF_TYPE_STYLES[type];
        const Icon = style.icon;
        return (
          <ToggleGroupItem
            key={type}
            value={type}
            size="sm"
            className="h-full flex-1 gap-1.5 text-muted-foreground data-pressed:text-foreground sm:h-full"
          >
            <Icon
              aria-hidden="true"
              className={cn("size-3.5 shrink-0", style.iconClassName)}
            />
            {t(style.labelKey)}
          </ToggleGroupItem>
        );
      })}
    </ToggleGroup>
  );
}
