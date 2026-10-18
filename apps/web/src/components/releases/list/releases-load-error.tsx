import { RotateCcw, TriangleAlert } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";

type ReleasesLoadErrorProps = {
  message: string;
  retrying: boolean;
  onRetry: () => void;
};

export function ReleasesLoadError({
  message,
  retrying,
  onRetry,
}: ReleasesLoadErrorProps) {
  const { t } = useTranslation();

  return (
    <Empty className="min-h-[60vh]" role="alert">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <TriangleAlert aria-hidden="true" />
        </EmptyMedia>
        <EmptyTitle className="text-base">{message}</EmptyTitle>
      </EmptyHeader>
      <EmptyContent>
        <Button variant="outline" loading={retrying} onClick={onRetry}>
          <RotateCcw aria-hidden="true" />
          {t("tasks:releases.retry")}
        </Button>
      </EmptyContent>
    </Empty>
  );
}
