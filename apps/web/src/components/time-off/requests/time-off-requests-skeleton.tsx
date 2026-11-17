import { useTranslation } from "react-i18next";
import { Skeleton } from "@/components/ui/skeleton";

const ROWS = [0, 1, 2];

export function TimeOffRequestsSkeleton() {
  const { t } = useTranslation();

  return (
    <div role="status" className="rounded-xl border">
      <span className="sr-only">{t("team:timeOff.loading")}</span>
      <div aria-hidden="true">
        {ROWS.map((row) => (
          <div
            key={row}
            className="flex items-center gap-3 border-b px-3 py-3 last:border-b-0"
          >
            <Skeleton className="size-4 rounded-full" />
            <div className="flex flex-1 flex-col gap-1.5">
              <Skeleton className="h-3.5 w-32" />
              <Skeleton className="h-3 w-48 max-w-full" />
            </div>
            <Skeleton className="h-4 w-16" />
          </div>
        ))}
      </div>
    </div>
  );
}
