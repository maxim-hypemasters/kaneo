import { TriangleAlert } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import type { BalanceProjection } from "@/lib/time-off/project-balance";
import { cn } from "@/lib/cn";

type TimeOffDaysSummaryProps = {
  // Working days in the picked range; null until both days are picked.
  workdays: number | null;
  // The request type's label: each type has its own allowance.
  typeLabel: string;
  projections: readonly BalanceProjection[];
  balanceLoading: boolean;
  balanceError: boolean;
};

// A live preview of what the request costs. Going over is allowed, so the
// warning never blocks sending.
export function TimeOffDaysSummary({
  workdays,
  typeLabel,
  projections,
  balanceLoading,
  balanceError,
}: TimeOffDaysSummaryProps) {
  const { t } = useTranslation();
  const over = projections.some((projection) => projection.overBy > 0);

  return (
    <div className="flex flex-col gap-3">
      <div
        aria-live="polite"
        className="flex flex-col gap-1 rounded-lg border bg-muted/40 px-3 py-2.5 text-sm"
      >
        {workdays === null ? (
          <p className="text-muted-foreground">
            {t("team:timeOff.summary.pickDates")}
          </p>
        ) : (
          <>
            <p className="font-medium tabular-nums">
              {t("team:timeOff.summary.weekdays", { count: workdays })}
            </p>
            {projections.length > 0 ? (
              <ul className="flex flex-col gap-0.5 text-xs">
                {projections.map((projection) => (
                  <li
                    key={projection.year}
                    className={cn(
                      "tabular-nums",
                      projection.overBy > 0
                        ? "text-warning-foreground"
                        : "text-muted-foreground",
                    )}
                  >
                    {projection.overBy > 0
                      ? t("team:timeOff.summary.over", {
                          type: typeLabel,
                          year: projection.year,
                          count: projection.overBy,
                        })
                      : t("team:timeOff.summary.remaining", {
                          type: typeLabel,
                          year: projection.year,
                          count: projection.remainingAfter,
                        })}
                  </li>
                ))}
              </ul>
            ) : workdays > 0 && balanceLoading ? (
              <p className="text-muted-foreground text-xs">
                {t("team:timeOff.summary.checking")}
              </p>
            ) : workdays > 0 && balanceError ? (
              <p className="text-muted-foreground text-xs">
                {t("team:timeOff.summary.balanceUnavailable")}
              </p>
            ) : null}
          </>
        )}
      </div>
      {over ? (
        <Alert variant="warning" role="status" aria-live="polite">
          <TriangleAlert aria-hidden="true" />
          <AlertTitle>{t("team:timeOff.summary.overTitle")}</AlertTitle>
          <AlertDescription>
            {t("team:timeOff.summary.overDescription")}
          </AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}
