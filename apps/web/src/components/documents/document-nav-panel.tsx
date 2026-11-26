import { X } from "lucide-react";
import { type ReactNode, useLayoutEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";

// The project's documents beside an open document. Below lg it covers the
// document instead, with its own close button, and Escape closes it.
export function DocumentNavPanel({
  id,
  docked,
  onLeaveWithFocus,
  onClose,
  children,
}: {
  id: string;
  docked: boolean;
  // Called when the panel goes away with focus inside it, as when picking a
  // document closes a panel that covers the page. Must be stable.
  onLeaveWithFocus: () => void;
  onClose: () => void;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const ref = useRef<HTMLElement>(null);
  // A layout cleanup runs while the panel is still in the page, so it can
  // tell whether focus is about to be lost with it.
  useLayoutEffect(() => {
    const element = ref.current;
    return () => {
      if (element?.contains(document.activeElement)) onLeaveWithFocus();
    };
  }, [onLeaveWithFocus]);

  return (
    <nav
      ref={ref}
      id={id}
      aria-label={t("common:documentWindow.navLabel")}
      className={cn(
        "flex min-h-0 flex-col border-e",
        docked
          ? "w-64 shrink-0 bg-muted/30 xl:w-72"
          : "absolute inset-y-0 start-0 z-10 w-full bg-background shadow-lg sm:max-w-xs",
      )}
      onKeyDown={(event) => {
        // Keys from dialogs the list opens bubble here through their portals.
        if (
          docked ||
          event.key !== "Escape" ||
          !event.currentTarget.contains(event.target as Node)
        )
          return;
        // Escape would close the whole document; here it closes the panel.
        event.stopPropagation();
        onClose();
      }}
    >
      {!docked && (
        <div className="flex shrink-0 items-center gap-1 border-b px-3 py-2">
          <h2 className="me-auto font-medium text-sm">
            {t("common:documentWindow.navLabel")}
          </h2>
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            aria-label={t("common:documentWindow.hideDocuments")}
            onClick={onClose}
          >
            <X />
          </Button>
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pt-4 pb-8">
        {children}
      </div>
    </nav>
  );
}
