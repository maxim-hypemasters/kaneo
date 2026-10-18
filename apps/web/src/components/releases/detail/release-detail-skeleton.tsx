import { useTranslation } from "react-i18next";
import { Skeleton } from "@/components/ui/skeleton";

export function ReleaseDetailSkeleton() {
  const { t } = useTranslation();

  return (
    <div role="status" className="space-y-5 px-4 py-5 sm:px-6">
      <span className="sr-only">{t("tasks:releases.pages.loading")}</span>
      <div aria-hidden="true" className="space-y-5">
        <Skeleton className="h-3 w-20" />
        <div className="space-y-2">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-32" />
        </div>
        <Skeleton className="h-1.5 w-full max-w-2xl" />
        <Skeleton className="h-3 w-72" />
      </div>
    </div>
  );
}
