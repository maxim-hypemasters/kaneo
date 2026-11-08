import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Dialog, DialogHeader, DialogPopup } from "@/components/ui/dialog";

// An open Feature document takes the whole screen; closing it returns to the
// Documents list underneath.
export function FeatureDocumentWindow({
  title,
  onClose,
  closeDisabled = false,
  actions,
  children,
}: {
  title: string;
  onClose: () => void;
  closeDisabled?: boolean;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !closeDisabled) onClose();
      }}
    >
      <DialogPopup
        fullscreen
        showCloseButton={false}
        initialFocus={false}
        // Named rather than titled: the page shows its own heading.
        aria-label={title}
        className="bg-background"
      >
        <DialogHeader className="flex-row items-center gap-2 border-b px-3 py-2 sm:px-6">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={closeDisabled}
            onClick={onClose}
          >
            <ArrowLeft className="size-3.5" />
            {t("tasks:features.workspace.allDocuments")}
          </Button>
          {actions && (
            <div className="ml-auto flex items-center gap-1">{actions}</div>
          )}
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {/* A ~900px reading column that fills the height, so the page
              continues below the text. */}
          <div className="flex min-h-full flex-col px-4 pt-8 sm:px-12 sm:pt-14">
            <div className="mx-auto flex w-full min-w-0 max-w-225 flex-1 flex-col">
              {children}
            </div>
          </div>
        </div>
      </DialogPopup>
    </Dialog>
  );
}
