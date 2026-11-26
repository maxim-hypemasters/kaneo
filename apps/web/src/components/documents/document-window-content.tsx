import { ArrowLeft, PanelLeft } from "lucide-react";
import { type ReactNode, useLayoutEffect } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { DialogHeader } from "@/components/ui/dialog";
import { useDocumentWindowFrame } from "./document-window-frame-context";

export type DocumentWindowProps = {
  title: string;
  onClose: () => void;
  closeDisabled?: boolean;
  actions?: ReactNode;
  // A panel beside the document, such as its comments.
  aside?: ReactNode;
  children: ReactNode;
};

// One open document inside its window: the bar with the way back, the
// reading column and the panel beside it.
export function DocumentWindowContent({
  title,
  onClose,
  closeDisabled = false,
  actions,
  aside,
  children,
}: DocumentWindowProps) {
  const { t } = useTranslation();
  const frame = useDocumentWindowFrame();
  const setLabel = frame?.setLabel;
  const setCloseDisabled = frame?.setCloseDisabled;
  const nav = frame?.nav;
  useLayoutEffect(() => setLabel?.(title), [setLabel, title]);
  useLayoutEffect(() => {
    setCloseDisabled?.(closeDisabled);
    return () => setCloseDisabled?.(false);
  }, [setCloseDisabled, closeDisabled]);

  return (
    <>
      <DialogHeader className="flex-row items-center gap-2 border-b px-3 py-2 sm:px-6">
        {nav && (
          <Button
            ref={nav.toggleRef}
            type="button"
            size="icon-sm"
            variant="ghost"
            aria-expanded={nav.open}
            aria-controls={nav.id}
            aria-label={t("common:documentWindow.navLabel")}
            className={nav.open ? "bg-accent" : undefined}
            onClick={nav.toggle}
          >
            <PanelLeft />
          </Button>
        )}
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
      <div className="relative flex min-h-0 flex-1">
        <div
          data-slot="document-window-scroll"
          className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain"
        >
          {/* A ~900px reading column that fills the height, so the page
              continues below the text. */}
          <div className="flex min-h-full flex-col px-4 pt-8 sm:px-12 sm:pt-14">
            <div className="mx-auto flex w-full min-w-0 max-w-225 flex-1 flex-col">
              {children}
            </div>
          </div>
        </div>
        {aside}
      </div>
    </>
  );
}
