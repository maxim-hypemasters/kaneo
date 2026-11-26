import {
  type ReactNode,
  useCallback,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { Dialog, DialogPopup } from "@/components/ui/dialog";
import { useStoredState } from "@/hooks/use-stored-state";
import { DocumentNavPanel } from "./document-nav-panel";
import { DocumentWindowFrameContext } from "./document-window-frame-context";
import { usePanelsDocked } from "./use-panels-docked";

const NAV_OPEN_KEY = "kaneo:document-nav-open";
const storedOpen = (raw: unknown) => raw !== false;

// The fullscreen dialog an open document fills. It stays mounted while the
// document inside it changes, so moving between documents from the panel
// beside them neither replays the dialog's entrance nor resets the panel.
export function DocumentWindowFrame({
  documentKey,
  nav,
  onClose,
  children,
}: {
  // The open document. Picking another closes a panel covering the document.
  documentKey?: string;
  // The panel listing the project's documents, when the window has one.
  nav?: ReactNode;
  onClose: () => void;
  children: ReactNode;
}) {
  const [label, setLabel] = useState("");
  const [closeDisabled, setCloseDisabled] = useState(false);
  const docked = usePanelsDocked();
  // Beside the document the panel stays as it was left; over it, it shows
  // only until a document is picked.
  const [dockedOpen, setDockedOpen] = useStoredState(
    NAV_OPEN_KEY,
    storedOpen,
    true,
  );
  const [covering, setCovering] = useState<{ key?: string } | null>(null);
  const navId = useId();
  const toggleRef = useRef<HTMLButtonElement>(null);
  const hasNav = Boolean(nav);
  const open =
    hasNav &&
    (docked ? dockedOpen : covering !== null && covering.key === documentKey);

  const toggle = useCallback(() => {
    if (docked) setDockedOpen((current) => !current);
    else
      setCovering((current) =>
        current && current.key === documentKey ? null : { key: documentKey },
      );
  }, [docked, documentKey, setDockedOpen]);
  const close = useCallback(() => setCovering(null), []);
  // The toggle may be in a header replaced in the same update, so it is
  // looked up once that update is done.
  const refocusToggle = useCallback(
    () => queueMicrotask(() => toggleRef.current?.focus()),
    [],
  );
  const value = useMemo(
    () => ({
      setLabel,
      setCloseDisabled,
      nav: hasNav ? { id: navId, open, toggle, toggleRef } : null,
    }),
    [hasNav, navId, open, toggle],
  );

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next && !closeDisabled) onClose();
      }}
    >
      <DialogPopup
        fullscreen
        showCloseButton={false}
        initialFocus={false}
        // Named rather than titled: the page shows its own heading.
        aria-label={label}
        className="bg-background"
      >
        <DocumentWindowFrameContext.Provider value={value}>
          <div className="relative flex min-h-0 flex-1">
            {open && (
              <DocumentNavPanel
                id={navId}
                docked={docked}
                onLeaveWithFocus={refocusToggle}
                onClose={close}
              >
                {nav}
              </DocumentNavPanel>
            )}
            <div className="flex min-h-0 min-w-0 flex-1 flex-col">
              {children}
            </div>
          </div>
        </DocumentWindowFrameContext.Provider>
      </DialogPopup>
    </Dialog>
  );
}
