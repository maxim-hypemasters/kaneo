import { useTranslation } from "react-i18next";
import { Skeleton } from "@/components/ui/skeleton";

const ROWS = [0, 1, 2, 3];

export function ReleaseListSkeleton() {
  const { t } = useTranslation();

  return (
    <div role="status">
      <span className="sr-only">{t("tasks:releases.pages.loading")}</span>
      <div aria-hidden="true" className="px-2 sm:px-4">
        {ROWS.map((row) => (
          <div
            key={row}
            className="grid grid-cols-[3rem_minmax(0,1fr)] gap-3 sm:grid-cols-[4.5rem_minmax(0,1fr)] sm:gap-4"
          >
            <div className="relative flex items-start justify-end border-border/60 border-r pr-3 sm:pr-4">
              <Skeleton className="h-7 w-6" />
              <Skeleton className="absolute top-0 -right-1 size-2 rounded-full" />
            </div>
            <div className="flex min-h-20 flex-wrap items-center justify-between gap-3 border-border/60 border-b py-4">
              <Skeleton className="h-4 w-32 max-w-full" />
              <div className="flex items-center gap-3">
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-4 w-20" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
