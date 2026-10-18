import { useTranslation } from "react-i18next";
import { Skeleton } from "@/components/ui/skeleton";

const ROWS = [0, 1, 2, 3, 4];

export function ReleaseItemsSkeleton() {
  const { t } = useTranslation();

  return (
    <div role="status">
      <span className="sr-only">{t("tasks:releases.detail.loadingTasks")}</span>
      <div aria-hidden="true">
        {ROWS.map((row) => (
          <div
            key={row}
            className="flex h-10 items-center gap-3 border-border/50 border-b px-4"
          >
            <Skeleton className="size-4 rounded-full" />
            <Skeleton className="h-3 w-12" />
            <Skeleton className="h-3 w-56" />
          </div>
        ))}
      </div>
    </div>
  );
}
