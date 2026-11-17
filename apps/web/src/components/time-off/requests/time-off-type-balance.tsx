import { useTranslation } from "react-i18next";
import { Meter, MeterIndicator, MeterTrack } from "@/components/ui/meter";
import type {
  TimeOffType,
  TimeOffTypeBalance as TypeBalance,
} from "@/fetchers/time-off/types";
import { cn } from "@/lib/cn";
import { TIME_OFF_TYPE_STYLES } from "../time-off-type-styles";

type TimeOffTypeBalanceProps = {
  type: TimeOffType;
  balance: TypeBalance;
};

// One type's allowance meter with its used, pending and remaining days.
export function TimeOffTypeBalance({ type, balance }: TimeOffTypeBalanceProps) {
  const { t } = useTranslation();
  const style = TIME_OFF_TYPE_STYLES[type];
  const Icon = style.icon;
  const label = t(style.labelKey);
  const over = balance.remainingDays < 0;
  const max = Math.max(balance.allowanceDays, balance.usedDays, 1);

  return (
    <li className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2 text-sm">
        <span className="flex min-w-0 items-center gap-1.5">
          <Icon
            aria-hidden="true"
            className={cn("size-3.5 shrink-0", style.iconClassName)}
          />
          <span className="truncate font-medium">{label}</span>
        </span>
        <span className="shrink-0 text-muted-foreground text-xs tabular-nums">
          {t("team:timeOff.balance.usedOf", {
            used: balance.usedDays,
            allowance: balance.allowanceDays,
          })}
        </span>
      </div>
      <Meter
        value={balance.usedDays}
        max={max}
        aria-label={t("team:timeOff.balance.meterLabel", {
          type: label,
          used: balance.usedDays,
          allowance: balance.allowanceDays,
        })}
      >
        <MeterTrack className="rounded-full">
          <MeterIndicator className={cn(over && "bg-destructive")} />
        </MeterTrack>
      </Meter>
      <div className="flex items-center justify-between gap-2 text-xs tabular-nums">
        <span className="text-muted-foreground">
          {t("team:timeOff.balance.pendingCount", {
            count: balance.pendingDays,
          })}
        </span>
        <span
          className={cn(
            over
              ? "font-medium text-destructive-foreground"
              : "text-foreground",
          )}
        >
          {over
            ? t("team:timeOff.balance.over", { count: -balance.remainingDays })
            : t("team:timeOff.balance.left", { count: balance.remainingDays })}
        </span>
      </div>
      {balance.allowanceSource === "override" ? (
        <p className="text-muted-foreground text-xs">
          {t("team:timeOff.balance.override")}
        </p>
      ) : null}
    </li>
  );
}
