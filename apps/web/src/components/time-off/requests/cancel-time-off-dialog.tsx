import { XIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import type { TimeOffRequest } from "@/fetchers/time-off/types";
import { useCancelTimeOffRequest } from "@/hooks/mutations/time-off/use-cancel-time-off-request";
import { formatReleaseRange } from "@/lib/releases/release-date";
import { timeOffErrorKey } from "@/lib/time-off/time-off-error-key";
import { toast } from "@/lib/toast";

type CancelTimeOffDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId: string;
  // Kept after closing, for the exit animation.
  request: TimeOffRequest | null;
  today: string;
};

export function CancelTimeOffDialog({
  open,
  onOpenChange,
  workspaceId,
  request,
  today,
}: CancelTimeOffDialogProps) {
  const { t } = useTranslation();
  const cancelRequest = useCancelTimeOffRequest(workspaceId);
  const range = request
    ? formatReleaseRange(request.startDate, request.endDate, { today })
    : "";
  const days = t("team:timeOff.weekdays", { count: request?.days ?? 0 });

  const handleConfirm = async () => {
    if (!request) return;
    try {
      await cancelRequest.mutateAsync(request.id);
      toast.success(t("team:timeOff.cancelDialog.success"), { icon: XIcon });
      onOpenChange(false);
    } catch (error) {
      const key = timeOffErrorKey(error);
      toast.error(
        key
          ? t(key)
          : error instanceof Error
            ? error.message
            : t("team:timeOff.cancelDialog.error"),
      );
    }
  };

  const pending = cancelRequest.isPending;

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (next || !pending) onOpenChange(next);
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {t("team:timeOff.cancelDialog.title")}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t(
              request?.status === "approved"
                ? "team:timeOff.cancelDialog.descriptionApproved"
                : "team:timeOff.cancelDialog.description",
              { range, days },
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={() => onOpenChange(false)}
          >
            {t("team:timeOff.cancelDialog.keep")}
          </Button>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            loading={pending}
            onClick={handleConfirm}
          >
            {t("team:timeOff.cancelDialog.confirm")}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
