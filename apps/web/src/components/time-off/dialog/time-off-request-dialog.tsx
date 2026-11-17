import { useState } from "react";
import { Dialog, DialogPopup } from "@/components/ui/dialog";
import type { TimeOffRequest } from "@/fetchers/time-off/types";
import { TimeOffRequestForm } from "./time-off-request-form";

type TimeOffRequestDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId: string;
  // null creates a request. Kept after closing, for the exit animation.
  request: TimeOffRequest | null;
  viewerId?: string;
  canRequest: boolean;
  canApprove: boolean;
  today: string;
};

export function TimeOffRequestDialog({
  open,
  onOpenChange,
  workspaceId,
  request,
  viewerId,
  canRequest,
  canApprove,
  today,
}: TimeOffRequestDialogProps) {
  const [busy, setBusy] = useState(false);

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && busy) return;
        onOpenChange(nextOpen);
      }}
    >
      <DialogPopup className="sm:max-w-lg" showCloseButton={!busy}>
        <TimeOffRequestForm
          key={`${workspaceId}:${request?.id ?? "new"}`}
          workspaceId={workspaceId}
          request={request}
          viewerId={viewerId}
          canRequest={canRequest}
          canApprove={canApprove}
          today={today}
          onClose={() => onOpenChange(false)}
          onBusyChange={setBusy}
        />
      </DialogPopup>
    </Dialog>
  );
}
