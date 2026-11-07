import { ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";

export function WorkspacePagination({
  page,
  totalPages,
  pending,
  onChange,
}: {
  page: number;
  totalPages: number;
  pending: boolean;
  onChange: (page: number) => void;
}) {
  const { t } = useTranslation();
  if (totalPages < 2) return null;
  return (
    <nav
      aria-label={t("common:pagination.label")}
      className="flex items-center justify-center gap-3 py-2"
    >
      <Button
        type="button"
        size="icon-sm"
        variant="outline"
        disabled={pending || page <= 1}
        onClick={() => onChange(page - 1)}
        aria-label={t("common:pagination.previousPage")}
      >
        <ChevronLeft />
      </Button>
      <span className="text-xs text-muted-foreground">
        {t("tasks:features.workspace.page", { page, totalPages })}
      </span>
      <Button
        type="button"
        size="icon-sm"
        variant="outline"
        disabled={pending || page >= totalPages}
        onClick={() => onChange(page + 1)}
        aria-label={t("common:pagination.nextPage")}
      >
        <ChevronRight />
      </Button>
    </nav>
  );
}
