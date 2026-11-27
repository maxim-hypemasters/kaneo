import { Loader2Icon } from "lucide-react";
import { useId, useRef } from "react";
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

type CopyPromptDialogProps = {
  open: boolean;
  /** The prompt the clipboard refused. */
  prompt: string;
  onClose: () => void;
  /** Where Start moves the task; without one the dialog only shows the text. */
  inProgressName: string | null;
  starting: boolean;
  onStart: () => void;
  /** Where focus goes on close; the menu that opened it may be gone. */
  finalFocus: () => HTMLElement | true;
};

// Opens when the browser refused the copy, so people copy the prompt
// themselves, then start the task as Copy prompt would have.
export function CopyPromptDialog({
  open,
  prompt,
  onClose,
  inProgressName,
  starting,
  onStart,
  finalFocus,
}: CopyPromptDialogProps) {
  const { t } = useTranslation();
  const textareaId = useId();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <AlertDialogContent initialFocus={textareaRef} finalFocus={finalFocus}>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {t("tasks:aiAgent.copyPromptDialog.title")}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t("tasks:aiAgent.copyPromptDialog.description")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="flex flex-col gap-1.5 px-6 pb-4">
          <label htmlFor={textareaId} className="font-medium text-sm">
            {t("tasks:aiAgent.copyPromptDialog.label")}
          </label>
          <textarea
            id={textareaId}
            ref={textareaRef}
            readOnly
            value={prompt}
            onFocus={(event) => event.currentTarget.select()}
            className="h-64 w-full resize-none rounded-lg border border-input bg-background px-3 py-2 font-mono text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
        <AlertDialogFooter>
          <Button type="button" variant="outline" size="sm" onClick={onClose}>
            {t("common:actions.close")}
          </Button>
          {/* Stays focusable while Start runs (a disabled button drops
              focus), since the dialog stays open when Start fails. */}
          {inProgressName ? (
            <Button
              type="button"
              size="sm"
              aria-disabled={starting || undefined}
              className="aria-disabled:pointer-events-none aria-disabled:opacity-64"
              onClick={starting ? undefined : onStart}
            >
              {starting ? (
                <Loader2Icon aria-hidden="true" className="animate-spin" />
              ) : null}
              {t("tasks:aiAgent.copyPromptDialog.moveToInProgress", {
                status: inProgressName,
              })}
            </Button>
          ) : null}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
