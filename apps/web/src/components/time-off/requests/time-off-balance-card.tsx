import { RotateCcw } from "lucide-react";
import { useId } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { TimeOffBalance } from "@/fetchers/time-off/types";
import { TIME_OFF_TYPE_ORDER } from "../time-off-type-styles";
import { TimeOffTypeBalance } from "./time-off-type-balance";

type TimeOffBalanceCardProps = {
  year: number;
  balance: TimeOffBalance | undefined;
  isError: boolean;
  retrying: boolean;
  onRetry: () => void;
};

export function TimeOffBalanceCard({
  year,
  balance,
  isError,
  retrying,
  onRetry,
}: TimeOffBalanceCardProps) {
  const { t } = useTranslation();
  const headingId = useId();

  let body = (
    <div role="status" className="flex flex-col gap-3">
      <span className="sr-only">{t("team:timeOff.loading")}</span>
      <Skeleton aria-hidden="true" className="h-2 w-full" />
      <Skeleton aria-hidden="true" className="h-16 w-full" />
    </div>
  );
  if (balance) {
    body = (
      <ul className="flex flex-col gap-4">
        {TIME_OFF_TYPE_ORDER.map((type) => (
          <TimeOffTypeBalance
            key={type}
            type={type}
            balance={balance.types[type]}
          />
        ))}
      </ul>
    );
  } else if (isError) {
    body = (
      <div role="alert" className="flex flex-col items-start gap-2 text-sm">
        <p className="text-muted-foreground">
          {t("team:timeOff.balance.loadError")}
        </p>
        <Button
          variant="outline"
          size="xs"
          loading={retrying}
          onClick={onRetry}
        >
          <RotateCcw aria-hidden="true" />
          {t("common:error.tryAgain")}
        </Button>
      </div>
    );
  }

  return (
    <section
      aria-labelledby={headingId}
      className="flex h-fit flex-col gap-4 rounded-xl border bg-card p-4"
    >
      <h2 id={headingId} className="font-medium text-sm">
        {t("team:timeOff.balance.title", { year })}
      </h2>
      {body}
    </section>
  );
}
