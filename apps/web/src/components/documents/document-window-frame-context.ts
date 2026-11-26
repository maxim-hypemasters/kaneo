import { createContext, type RefObject, useContext } from "react";

export type DocumentWindowNav = {
  // The panel's element id, for the toggle's aria-controls.
  id: string;
  open: boolean;
  toggle: () => void;
  // The toggle in the open document's header, which takes focus back when a
  // panel covering the document closes.
  toggleRef: RefObject<HTMLButtonElement | null>;
};

export type DocumentWindowFrameState = {
  // The dialog is named after the open document.
  setLabel: (label: string) => void;
  // Set while closing would lose work, such as an upload in flight.
  setCloseDisabled: (disabled: boolean) => void;
  nav: DocumentWindowNav | null;
};

export const DocumentWindowFrameContext =
  createContext<DocumentWindowFrameState | null>(null);

export function useDocumentWindowFrame() {
  return useContext(DocumentWindowFrameContext);
}
