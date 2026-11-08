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
  // Saves the draft now. Resolves true once nothing is left unsaved; leaving
  // asks to discard only when it resolves false.
  flush?: () => Promise<boolean>;
  // Cleanup that needs the session. It runs once an account action, such as
  // signing out, is allowed to leave, and the action waits for it.
  finish?: () => Promise<void>;
};

type DocumentDraftGuard = {
  register: (id: string, draft: DocumentDraft) => void;
  unregister: (id: string) => void;
  requestLeave: (action: () => void) => Promise<boolean>;
};

type ActiveGuard = {
  confirmLeave: () => Promise<boolean>;
  finish: () => Promise<void>;
};

const DocumentDraftContext = createContext<DocumentDraftGuard | null>(null);
const activeGuards = new Set<ActiveGuard>();

/** Used by account actions rendered outside the current document's view. */
export async function requestDocumentDraftLeave() {
  const guards = [...activeGuards];
  for (const guard of guards) {
    if (!(await guard.confirmLeave())) return false;
  }
  await Promise.all(guards.map((guard) => guard.finish()));
  return true;
}

export function DocumentDraftGuardProvider({
  children,
}: {
  children: ReactNode;
}) {
  const drafts = useRef(new Map<string, DocumentDraft>());
  const pending = useRef<((allowed: boolean) => void) | null>(null);
  const flushing = useRef(false);
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

  const confirmLeave = useCallback(async (): Promise<boolean> => {
    const entries = [...drafts.current.values()];
    if (entries.some((draft) => draft.saving)) return false;
    const dirty = entries.filter((draft) => draft.dirty);
    if (!dirty.length) return true;
    if (pending.current || flushing.current) return false;

    if (dirty.some((draft) => draft.flush)) {
      // Registered snapshots can be a render behind, so the flush results
      // decide whether anything is left to lose.
      flushing.current = true;
      let saved: boolean[];
      try {
        saved = await Promise.all(
          dirty.map((draft) =>
            draft.flush ? draft.flush().catch(() => false) : false,
          ),
        );
      } finally {
        // Cleared before the leave action runs, which can ask again.
        flushing.current = false;
      }
      if (saved.every(Boolean)) return true;
    }

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
    const guard: ActiveGuard = {
      confirmLeave,
      finish: async () => {
        await Promise.all(
          [...drafts.current.values()].map((draft) =>
            draft.finish?.().catch(() => {}),
          ),
        );
      },
    };
    activeGuards.add(guard);
    return () => {
      activeGuards.delete(guard);
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
