import { useTranslation } from "react-i18next";
import { Skeleton } from "@/components/ui/skeleton";

const ROWS = [0, 1, 2, 3, 4];

export function TimeOffTimelineSkeleton() {
  const { t } = useTranslation();

  return (
    <div role="status" className="flex-1">
      <span className="sr-only">{t("team:timeOff.loading")}</span>
      <div aria-hidden="true">
        <div className="flex h-12 items-end gap-3 border-b px-3 pb-2">
          <Skeleton className="h-3 w-24" />
        </div>
        {ROWS.map((row) => (
          <div
            key={row}
            className="flex h-11 items-center gap-3 border-b border-border/60 px-3"
          >
            <Skeleton className="size-5 rounded-full" />
            <Skeleton className="h-3 w-28" />
            <Skeleton
              className="ml-auto h-6 rounded-md"
              style={{ width: `${12 + row * 6}%`, marginRight: `${row * 9}%` }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
