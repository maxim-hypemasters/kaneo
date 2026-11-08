import type { UseQueryResult } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { HttpError } from "@/lib/http-error";

type InboxResourceStateProps = {
  query: Pick<
    UseQueryResult,
    "isLoading" | "isError" | "error" | "isFetching" | "refetch"
  >;
  unavailableMessage: string;
  loadErrorMessage: string;
};

// What the inbox shows while the item a notification points at loads, or
// once it can't be shown. Only a network failure offers a retry.
export function InboxResourceState({
  query,
  unavailableMessage,
  loadErrorMessage,
}: InboxResourceStateProps) {
  const { t } = useTranslation();

  if (query.isLoading) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-7 w-2/3" />
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  const unavailable =
    !query.isError ||
    (query.error instanceof HttpError &&
      [400, 403, 404].includes(query.error.status));
  return (
    <div className="flex flex-col items-start gap-3">
      <p role="alert" className="text-muted-foreground text-sm">
        {unavailable ? unavailableMessage : loadErrorMessage}
      </p>
      {!unavailable && (
        <Button
          variant="outline"
          disabled={query.isFetching}
          onClick={() => void query.refetch()}
        >
          {t("common:error.tryAgain")}
        </Button>
      )}
    </div>
  );
}
