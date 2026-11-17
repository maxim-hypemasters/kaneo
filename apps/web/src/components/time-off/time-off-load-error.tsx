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
import { cn } from "@/lib/cn";

type TimeOffLoadErrorProps = {
  message: string;
  retrying: boolean;
  onRetry: () => void;
  className?: string;
};

export function TimeOffLoadError({
  message,
  retrying,
  onRetry,
  className,
}: TimeOffLoadErrorProps) {
  const { t } = useTranslation();

  return (
    <Empty className={cn("min-h-64", className)} role="alert">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <TriangleAlert aria-hidden="true" />
        </EmptyMedia>
        <EmptyTitle className="text-base">{message}</EmptyTitle>
      </EmptyHeader>
      <EmptyContent>
        <Button
          variant="outline"
          size="sm"
          loading={retrying}
          onClick={onRetry}
        >
          <RotateCcw aria-hidden="true" />
          {t("common:error.tryAgain")}
        </Button>
      </EmptyContent>
    </Empty>
  );
}
