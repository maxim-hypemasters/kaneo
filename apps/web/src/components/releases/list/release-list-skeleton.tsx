import { useTranslation } from "react-i18next";
import { Skeleton } from "@/components/ui/skeleton";

const ROWS = [0, 1, 2, 3];

export function ReleaseListSkeleton() {
  const { t } = useTranslation();

  return (
    <div role="status">
      <span className="sr-only">{t("tasks:releases.pages.loading")}</span>
      <div aria-hidden="true">
        <div className="flex h-9 items-center border-border/60 border-b bg-muted/60 px-4">
          <Skeleton className="h-3 w-16" />
        </div>
        {ROWS.map((row) => (
          <div
            key={row}
            className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-2 border-border/60 border-b px-4 py-3 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1.4fr)_minmax(9rem,1fr)_2rem] md:items-center md:gap-x-6"
          >
            <div className="space-y-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-24" />
            </div>
            <Skeleton className="col-span-2 h-3 w-56 md:col-span-1" />
            <div className="col-span-2 space-y-2 md:col-span-1">
              <Skeleton className="h-1.5 w-full" />
              <Skeleton className="h-3 w-20" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
