import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  useEffect,
  useLayoutEffect,
  useReducer,
  useRef,
  useState,
} from "react";
import {
  pruneFeatureAssets,
  updateFeatureDocument,
} from "@/fetchers/feature/feature-workspace";
import type { FeatureDocument } from "@/fetchers/feature/types";
import { featureWorkspaceKey } from "@/hooks/queries/feature/use-feature-workspace";
import { extractAssetIds } from "@/lib/extract-asset-ids";
import { HttpError } from "@/lib/http-error";
import { uploadDraftAsset } from "@/lib/upload-draft-asset";
import { createAutosaveQueue } from "./document-autosave-queue";
import {
  type DocumentSaveInput,
  type DocumentText,
  documentSaveInput,
  type SavedDocument,
} from "./feature-document-save-input";

export type DocumentSaveStatus =
  | "idle"
  | "saving"
  | "saved"
  | "error"
  | "conflict"
  | "readOnly";

const AUTOSAVE_DELAY_MS = 1000;
// The prune route accepts at most this many ids per request.
const PRUNE_BATCH_SIZE = 100;

function savedFrom(document: FeatureDocument): SavedDocument {
  return {
    title: document.title,
    body: document.body,
    revision: document.revision,
  };
}

type Session = {
  local: DocumentText;
  saved: SavedDocument;
  failure: "error" | "conflict" | null;
  savedInSession: boolean;
  // Something was saved, so the documents list is out of date.
  listStale: boolean;
  // Uploads not yet claimed by a save.
  staged: Set<string>;
  // Uploads this session's saves took out of the text.
  removedByUs: Set<string>;
  discarded: boolean;
  active: boolean;
};

function startSession(document: FeatureDocument): Session {
  return {
    local: { title: document.title, body: document.body },
    saved: savedFrom(document),
    failure: null,
    savedInSession: false,
    listStale: false,
    staged: new Set(),
    removedByUs: new Set(),
    discarded: false,
    active: true,
  };
}

// Starts from a revision the server holds. Any staged upload that revision
// refers to was claimed by the save that wrote it, so it is not sent again.
function rebase(session: Session, document: FeatureDocument) {
  session.saved = savedFrom(document);
  for (const id of extractAssetIds(document.body)) session.staged.delete(id);
}

// Deletes the uploads this session's saves removed that neither the saved nor
// the local text uses, so a save still on its way can bring one back safely.
// Errors are ignored: a missed prune only keeps unused files.
async function pruneRemoved(session: Session, featureId: string) {
  const kept = new Set([
    ...extractAssetIds(session.saved.body),
    ...extractAssetIds(session.local.body),
  ]);
  const unused = [...session.removedByUs].filter((id) => !kept.has(id));
  for (const id of unused) session.removedByUs.delete(id);
  const batches = [];
  for (let start = 0; start < unused.length; start += PRUNE_BATCH_SIZE)
    batches.push(
      pruneFeatureAssets(
        featureId,
        unused.slice(start, start + PRUNE_BATCH_SIZE),
      ).catch(() => {}),
    );
  await Promise.all(batches);
}

// Saves a Feature document about a second after typing stops. Local text is
// never replaced by a save response, so typing during a save is kept.
export function useFeatureDocumentAutosave({
  projectId,
  featureId,
  document,
  canEdit,
  refresh,
}: {
  projectId: string;
  featureId: string;
  document: FeatureDocument;
  canEdit: boolean;
  refresh: () => Promise<unknown>;
}) {
  const queryClient = useQueryClient();
  // Not useFeatureWorkspaceMutation: refreshing the whole workspace, task and
  // activity after every keystroke pause would refetch far too much.
  const { mutateAsync } = useMutation({
    mutationFn: (input: DocumentSaveInput) =>
      updateFeatureDocument(featureId, document.id, {
        ...input,
        // Undo or paste can bring a removed upload back; the session prunes
        // what is still unused when the page closes.
        keepRemovedAssets: true,
      }),
  });
  const [, rerender] = useReducer((count: number) => count + 1, 0);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [reviewAvailable, setReviewAvailable] = useState(true);
  // Saves, timers and the final flush after unmount read the current values
  // here rather than a render's copy.
  const sessionRef = useRef<Session>(null);
  sessionRef.current ??= startSession(document);
  const session = sessionRef.current;
  const latest = useRef({ document, canEdit, refresh, mutateAsync, save });
  latest.current = { document, canEdit, refresh, mutateAsync, save };
  const [queue] = useState(() =>
    createAutosaveQueue({
      delay: AUTOSAVE_DELAY_MS,
      save: () => latest.current.save(),
      pending: () =>
        documentSaveInput(session.local, session.saved, session.staged) !==
        null,
      onBusy: (value) => {
        if (session.active) setBusy(value);
      },
    }),
  );

  function update() {
    if (session.active) rerender();
  }

  async function refreshLatest() {
    if (!session.active) return;
    setRefreshing(true);
    setReviewAvailable(false);
    try {
      await latest.current.refresh();
      if (session.active) setReviewAvailable(true);
    } catch {
      // The conflict notice offers Try again.
    } finally {
      if (session.active) setRefreshing(false);
    }
  }

  async function save() {
    const current = latest.current;
    if (!current.canEdit || session.discarded || session.failure === "conflict")
      return false;
    const before = session.saved;
    const input = documentSaveInput(session.local, before, session.staged);
    if (!input) {
      // The failed change was undone, so nothing is left to fail.
      if (session.failure) {
        session.failure = null;
        update();
      }
      return true;
    }
    // Someone else saved since: the person chooses which text to keep.
    if (current.document.revision > before.revision) return false;
    // A failure stays shown until a save succeeds, so retrying does not
    // announce it again.
    try {
      const value = await current.mutateAsync(input);
      if (input.body !== undefined) {
        const kept = extractAssetIds(value.body);
        for (const id of extractAssetIds(before.body))
          if (!kept.has(id)) session.removedByUs.add(id);
      }
      for (const id of input.draftAssetIds ?? []) session.staged.delete(id);
      session.saved = savedFrom(value);
      session.failure = null;
      session.savedInSession = true;
      session.listStale = true;
      queryClient.setQueryData<FeatureDocument>(
        [...featureWorkspaceKey(projectId, featureId), "document", value.id],
        (cached) =>
          cached && cached.revision > value.revision ? cached : value,
      );
      update();
      return true;
    } catch (error) {
      const conflict =
        error instanceof HttpError && error.code === "DOCUMENT_CONFLICT";
      session.failure = conflict ? "conflict" : "error";
      update();
      if (conflict) void refreshLatest();
      return false;
    }
  }

  function change(value: Partial<DocumentText>) {
    session.local = { ...session.local, ...value };
    session.discarded = false;
    update();
    if (latest.current.canEdit && session.failure !== "conflict")
      queue.schedule();
  }

  function flush() {
    return session.discarded ? Promise.resolve(true) : queue.flush();
  }

  // A newer revision from someone else replaces clean text right away; with
  // local changes it becomes a conflict instead. While a save is in flight
  // the newer revision may be that save's own, so it waits.
  // A layout effect, so the editor shows the adopted text before it can take
  // input: a keystroke typed into the old text would save over the new one.
  useLayoutEffect(() => {
    if (busy || document.revision <= session.saved.revision) return;
    if (documentSaveInput(session.local, session.saved, session.staged)) return;
    rebase(session, document);
    session.local = { title: document.title, body: document.body };
    session.failure = null;
    rerender();
  }, [busy, document, session]);

  useEffect(() => {
    if (!canEdit) queue.cancel();
  }, [canEdit, queue]);

  useEffect(() => {
    const onVisibilityChange = () => {
      if (window.document.visibilityState === "hidden" && !session.discarded)
        void queue.flush();
    };
    window.document.addEventListener("visibilitychange", onVisibilityChange);
    return () =>
      window.document.removeEventListener(
        "visibilitychange",
        onVisibilityChange,
      );
  }, [queue, session]);

  // A reload or a closed tab never unmounts the page, so prune as it goes.
  useEffect(() => {
    const onPageHide = () => void pruneRemoved(session, featureId);
    window.addEventListener("pagehide", onPageHide);
    return () => window.removeEventListener("pagehide", onPageHide);
  }, [featureId, session]);

  // Closing saves what is left, then refreshes the list once and prunes the
  // uploads this session's saves removed. It clears what it used, so the
  // extra cleanup of React's StrictMode does nothing twice.
  useEffect(() => {
    session.active = true;
    return () => {
      session.active = false;
      const flushed = session.discarded ? Promise.resolve(true) : queue.flush();
      void flushed.finally(() => {
        if (session.listStale) {
          session.listStale = false;
          void queryClient.invalidateQueries({
            queryKey: [
              ...featureWorkspaceKey(projectId, featureId),
              "documents",
            ],
          });
        }
        void pruneRemoved(session, featureId);
      });
    };
  }, [featureId, projectId, queryClient, queue, session]);

  const input = documentSaveInput(session.local, session.saved, session.staged);
  const unsaved = busy || input !== null;
  const conflict =
    session.failure === "conflict" ||
    (input !== null && !busy && document.revision > session.saved.revision);
  const status: DocumentSaveStatus = !canEdit
    ? "readOnly"
    : conflict
      ? "conflict"
      : session.failure === "error" && unsaved
        ? "error"
        : unsaved
          ? "saving"
          : session.savedInSession
            ? "saved"
            : "idle";

  return {
    value: session.local,
    status,
    editable: canEdit,
    unsaved,
    conflict,
    uploading,
    refreshing,
    reviewAvailable,
    changeTitle: (title: string) => change({ title }),
    changeBody: (body: string) => change({ body }),
    // A blank title is never saved; leaving the field restores the saved one.
    commitTitle() {
      if (session.local.title.trim()) return;
      session.local = { ...session.local, title: session.saved.title };
      update();
    },
    // Allowed during a save: the upload is claimed by the save that first
    // includes it.
    async upload(file: File) {
      if (!latest.current.canEdit) throw new Error("Document is not editable");
      const asset = await uploadDraftAsset(projectId, file, featureId);
      if (!session.active) throw new Error("Document has been closed");
      session.staged.add(asset.id);
      return asset;
    },
    setUploading,
    flush,
    // For leaving through an account action, while requests still carry the
    // session; signing out first would turn the prune on close into a 401.
    prune: () => pruneRemoved(session, featureId),
    retry: () => void queue.flush(),
    refreshLatest,
    // Saves the local text on top of the latest revision.
    keepMine() {
      if (refreshing || !reviewAvailable) return;
      rebase(session, latest.current.document);
      session.failure = null;
      update();
      void queue.flush();
    },
    acceptLatest() {
      const value = latest.current.document;
      queue.cancel();
      rebase(session, value);
      session.local = { title: value.title, body: value.body };
      session.failure = null;
      update();
    },
    discard() {
      queue.cancel();
      session.discarded = true;
      session.local = { title: session.saved.title, body: session.saved.body };
      update();
    },
  };
}
