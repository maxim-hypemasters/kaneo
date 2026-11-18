import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";

export function TestCasePagination({
  page,
  totalPages,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}) {
  const { t } = useTranslation();
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-end gap-2">
      <Button
        variant="outline"
        disabled={page <= 1}
        onClick={() => onPageChange(page - 1)}
      >
        {t("common:pagination.previous")}
      </Button>
      <span className="text-sm tabular-nums">
        {page}/{totalPages}
      </span>
      <Button
        variant="outline"
        disabled={page >= totalPages}
        onClick={() => onPageChange(page + 1)}
      >
        {t("common:pagination.next")}
      </Button>
    </div>
  );
}
