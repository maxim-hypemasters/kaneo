import { useId } from "react";
import { useTranslation } from "react-i18next";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { TimeOffType } from "@/fetchers/time-off/types";
import { cn } from "@/lib/cn";
import {
  TIME_OFF_TYPE_ORDER,
  TIME_OFF_TYPE_STYLES,
} from "../time-off-type-styles";

type TimeOffTypeFieldProps = {
  value: TimeOffType;
  disabled?: boolean;
  onChange: (type: TimeOffType) => void;
};

export function TimeOffTypeField({
  value,
  disabled = false,
  onChange,
}: TimeOffTypeFieldProps) {
  const { t } = useTranslation();
  const triggerId = useId();
  const selected = TIME_OFF_TYPE_STYLES[value];
  const SelectedIcon = selected.icon;

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={triggerId}>{t("team:timeOff.dialog.typeLabel")}</Label>
      <Select
        value={value}
        disabled={disabled}
        onValueChange={(next) => {
          const type = TIME_OFF_TYPE_ORDER.find((option) => option === next);
          if (type) onChange(type);
        }}
      >
        <SelectTrigger id={triggerId}>
          <SelectValue>
            <span className="flex items-center gap-2">
              <SelectedIcon
                aria-hidden="true"
                className={cn("size-4", selected.iconClassName)}
              />
              {t(selected.labelKey)}
            </span>
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {TIME_OFF_TYPE_ORDER.map((type) => {
            const style = TIME_OFF_TYPE_STYLES[type];
            const Icon = style.icon;
            return (
              <SelectItem key={type} value={type}>
                <span className="flex items-center gap-2">
                  <Icon
                    aria-hidden="true"
                    className={cn("size-4", style.iconClassName)}
                  />
                  {t(style.labelKey)}
                </span>
              </SelectItem>
            );
          })}
        </SelectContent>
      </Select>
    </div>
  );
}
