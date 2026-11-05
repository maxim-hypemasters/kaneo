import { useBlocker } from "@tanstack/react-router";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { DocumentDraftDiscardDialog } from "./document-draft-discard-dialog";

type DocumentDraft = {
  dirty: boolean;
  saving: boolean;
  onDiscard: () => void;
};

type DocumentDraftGuard = {
  register: (id: string, draft: DocumentDraft) => void;
  unregister: (id: string) => void;
  requestLeave: (action: () => void) => Promise<boolean>;
};

const DocumentDraftContext = createContext<DocumentDraftGuard | null>(null);
const activeGuards = new Set<() => Promise<boolean>>();

/** Used by account actions rendered outside the current document's view. */
export async function requestDocumentDraftLeave() {
  for (const confirmLeave of activeGuards) {
    if (!(await confirmLeave())) return false;
  }
  return true;
}

export function DocumentDraftGuardProvider({
  children,
}: {
  children: ReactNode;
}) {
  const drafts = useRef(new Map<string, DocumentDraft>());
  const pending = useRef<((allowed: boolean) => void) | null>(null);
  const [requiresProtection, setRequiresProtection] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const updateProtection = useCallback(() => {
    setRequiresProtection(
      [...drafts.current.values()].some((draft) => draft.dirty || draft.saving),
    );
  }, []);

  const register = useCallback(
    (id: string, draft: DocumentDraft) => {
      drafts.current.set(id, draft);
      updateProtection();
    },
    [updateProtection],
  );
  const unregister = useCallback(
    (id: string) => {
      drafts.current.delete(id);
      updateProtection();
    },
    [updateProtection],
  );

  const confirmLeave = useCallback((): Promise<boolean> => {
    const entries = [...drafts.current.values()];
    if (entries.some((draft) => draft.saving)) return Promise.resolve(false);
    if (!entries.some((draft) => draft.dirty)) return Promise.resolve(true);
    if (pending.current) return Promise.resolve(false);

    setConfirmOpen(true);
    return new Promise((resolve) => {
      pending.current = resolve;
    });
  }, []);

  const resolveLeave = useCallback(
    (discard: boolean) => {
      if (discard) {
        if ([...drafts.current.values()].some((draft) => draft.saving)) return;
        for (const [id, draft] of drafts.current) {
          if (draft.dirty) {
            drafts.current.set(id, { ...draft, dirty: false });
            draft.onDiscard();
          }
        }
        updateProtection();
      }
      const resolve = pending.current;
      pending.current = null;
      setConfirmOpen(false);
      resolve?.(discard);
    },
    [updateProtection],
  );

  useEffect(
    () => () => {
      pending.current?.(false);
      pending.current = null;
    },
    [],
  );

  useEffect(() => {
    activeGuards.add(confirmLeave);
    return () => {
      activeGuards.delete(confirmLeave);
    };
  }, [confirmLeave]);

  useBlocker({
    shouldBlockFn: async () => !(await confirmLeave()),
    enableBeforeUnload: requiresProtection,
  });

  const requestLeave = useCallback(
    async (action: () => void) => {
      const allowed = await confirmLeave();
      if (allowed) action();
      return allowed;
    },
    [confirmLeave],
  );
  const value = useMemo(
    () => ({ register, unregister, requestLeave }),
    [register, unregister, requestLeave],
  );

  return (
    <DocumentDraftContext.Provider value={value}>
      {children}
      <DocumentDraftDiscardDialog
        open={confirmOpen}
        onKeepEditing={() => resolveLeave(false)}
        onDiscard={() => resolveLeave(true)}
      />
    </DocumentDraftContext.Provider>
  );
}

/** Register a description draft with its containing sheet or full-page view. */
export function useDocumentDraftGuard(draft: DocumentDraft) {
  const guard = useContext(DocumentDraftContext);
  const id = useId();

  useLayoutEffect(() => {
    guard?.register(id, draft);
  }, [guard, id, draft]);
  useLayoutEffect(() => () => guard?.unregister(id), [guard, id]);
}

export function useDocumentDraftNavigation() {
  const guard = useContext(DocumentDraftContext);
  if (!guard) throw new Error("Document draft navigation requires a provider");
  return guard.requestLeave;
}
