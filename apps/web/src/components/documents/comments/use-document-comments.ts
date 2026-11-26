import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { captureAnchor } from "@/components/editor/comments/capture-anchor";
import type { CommentRange } from "@/components/editor/comments/comment-anchor";
import { getCommentHighlightState } from "@/components/editor/comments/comment-highlights";
import { projectDocumentText } from "@/components/editor/comments/document-text";
import { pendingAnchorUpdates } from "@/components/editor/comments/pending-anchor-updates";
import { scrollToRange } from "@/components/editor/comments/scroll-to-range";
import type { DocumentEditorComments } from "@/components/editor/document-editor-types";
import { useAuth } from "@/components/providers/auth-provider/hooks/use-auth";
import { createDocumentComment } from "@/fetchers/document-comment/create-document-comment";
import { replyToDocumentComment } from "@/fetchers/document-comment/reply-to-document-comment";
import { resolveDocumentComment } from "@/fetchers/document-comment/resolve-document-comment";
import type {
  CommentedDocument,
  DocumentComment,
  DocumentCommentThread,
} from "@/fetchers/document-comment/types";
import { updateDocumentComment } from "@/fetchers/document-comment/update-document-comment";
import { useDeleteDocumentComment } from "@/hooks/mutations/document-comment/use-delete-document-comment";
import { useDocumentCommentMutation } from "@/hooks/mutations/document-comment/use-document-comment-mutation";
import { useDocumentCommentThreads } from "@/hooks/queries/document-comment/use-document-comment-threads";
import { toast } from "@/lib/toast";
import type { CommentAnchorSnapshot } from "./comment-anchor-snapshot";
import type { ThreadActions } from "./comment-thread-card";
import { sortThreads, type ThreadFilter } from "./sort-threads";
import { useCommentHighlights } from "./use-comment-highlights";
import { usePanelsDocked } from "../use-panels-docked";
import { useProjectMentionMembers } from "@/components/editor/use-project-mention-members";

const NO_THREADS: DocumentCommentThread[] = [];

type Draft = { range: CommentRange; quote: string; truncated: boolean };
// Why the comment being written could not be posted.
type DraftFailure = "post" | "save" | "lost";

const DRAFT_FAILURES = {
  post: "common:documentComments.postFailed",
  save: "common:documentComments.saveFirstFailed",
  lost: "common:documentComments.draftLost",
} as const satisfies Record<DraftFailure, string>;

// Everything the comments of one open document need: the threads, the panel,
// the highlights in the text and the comment being written.
export function useDocumentComments({
  document,
  canComment,
  conflict,
  flush,
  onAnchorsChange,
  initialCommentId,
}: {
  document: CommentedDocument;
  canComment: boolean;
  // Someone else saved first and the choice of text is still open.
  conflict: boolean;
  // Saves the document's pending edits; resolves false when that fails.
  flush: () => Promise<boolean>;
  // Receives the anchors the document's next save should send.
  onAnchorsChange: (snapshot: CommentAnchorSnapshot | null) => void;
  // A thread or reply to show when the document opens.
  initialCommentId?: string;
}) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const panelId = useId();
  const toggle = useRef<HTMLButtonElement>(null);
  const docked = usePanelsDocked();
  const query = useDocumentCommentThreads(document);
  const threads = query.data ?? NO_THREADS;
  const members = useProjectMentionMembers(document.projectId);
  const [open, setOpen] = useState(Boolean(initialCommentId));
  const [filter, setFilter] = useState<ThreadFilter>("open");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [draftFailure, setDraftFailure] = useState<DraftFailure>("post");
  const [deleting, setDeleting] = useState<DocumentComment | null>(null);
  // A thread whose text the document should scroll to once it is found.
  const [revealId, setRevealId] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);
  const { editor, setEditor, attachedIds } = useCommentHighlights({
    threads,
    activeId,
    draftRange: draft?.range ?? null,
  });

  const create = useDocumentCommentMutation(
    document,
    (input: Parameters<typeof createDocumentComment>[1]) =>
      createDocumentComment(document, input),
  );
  const reply = useDocumentCommentMutation(
    document,
    (input: { threadId: string; content: string }) =>
      replyToDocumentComment(document, input.threadId, input.content),
  );
  const edit = useDocumentCommentMutation(
    document,
    (input: { commentId: string; content: string }) =>
      updateDocumentComment(document, input.commentId, input.content),
  );
  const resolve = useDocumentCommentMutation(
    document,
    (input: { threadId: string; resolved: boolean }) =>
      resolveDocumentComment(document, input.threadId, input.resolved),
  );
  const remove = useDeleteDocumentComment(document);

  // The document's next save sends the anchors edits have moved. They are
  // read where the editor reports a change, so they describe exactly the
  // text that save will carry.
  const lastBody = useRef<string | null>(null);
  function recordAnchors(body: string) {
    lastBody.current = body;
    const state =
      editor && !editor.isDestroyed ? getCommentHighlightState(editor) : null;
    onAnchorsChange(
      editor && state && state.ranges.size > 0
        ? {
            body,
            updates: pendingAnchorUpdates(
              projectDocumentText(editor.state.doc),
              state.tracked,
              state.ranges,
            ),
          }
        : null,
    );
  }
  // Threads that arrive between edits change what is pending.
  const latest = useRef({ recordAnchors });
  latest.current = { recordAnchors };
  useEffect(() => {
    if (lastBody.current !== null)
      latest.current.recordAnchors(lastBody.current);
  }, [editor, threads]);

  useEffect(() => {
    if (!revealId || !editor || editor.isDestroyed) return;
    const range = getCommentHighlightState(editor)?.ranges.get(revealId);
    if (!range) return;
    scrollToRange(editor, range);
    setRevealId(null);
  }, [revealId, editor, attachedIds]);

  // A link to a comment opens its thread, once the threads have loaded.
  const linked = useRef<string | null>(null);
  useEffect(() => {
    if (!initialCommentId || !query.data) return;
    if (linked.current === initialCommentId) return;
    linked.current = initialCommentId;
    const thread = query.data.find(
      (candidate) =>
        candidate.id === initialCommentId ||
        candidate.replies.some((item) => item.id === initialCommentId),
    );
    setOpen(true);
    if (!thread) {
      setMissing(true);
      return;
    }
    setFilter(thread.resolvedAt ? "resolved" : "open");
    setActiveId(thread.id);
    setRevealId(thread.id);
  }, [initialCommentId, query.data]);

  function show(thread: DocumentCommentThread) {
    setFilter(thread.resolvedAt ? "resolved" : "open");
    setActiveId(thread.id);
  }

  function close() {
    setOpen(false);
    setDraft(null);
    toggle.current?.focus();
  }

  function startDraft() {
    if (!editor || editor.isDestroyed || !canComment) return;
    if (conflict) {
      toast.error(t("common:documentComments.conflictBlocked"));
      return;
    }
    const { from, to } = editor.state.selection;
    const captured =
      from === to
        ? null
        : captureAnchor(projectDocumentText(editor.state.doc), from, to);
    if (!captured) {
      toast.error(t("common:documentComments.selectionEmpty"));
      return;
    }
    setDraft({
      range: captured.range,
      quote: captured.anchor.quote,
      truncated: captured.truncated,
    });
    // The draft highlight now marks the text. Leaving it selected would keep
    // the formatting menu floating over it while the comment is written.
    editor.commands.setTextSelection(captured.range.to);
    setDraftFailure("post");
    setFilter("open");
    setActiveId(null);
    setMissing(false);
    setOpen(true);
  }

  async function submitDraft(content: string) {
    if (!editor || editor.isDestroyed) throw new Error("No document");
    // The server must hold the quoted text before a thread points at it.
    if (!(await flush())) {
      setDraftFailure("save");
      throw new Error("Document not saved");
    }
    // Typing since the selection may have moved or removed it.
    const range = getCommentHighlightState(editor)?.draft;
    const captured = range
      ? captureAnchor(
          projectDocumentText(editor.state.doc),
          range.from,
          range.to,
        )
      : null;
    if (!captured) {
      setDraftFailure("lost");
      throw new Error("Selection lost");
    }
    setDraftFailure("post");
    const thread = await create.mutateAsync({
      content,
      anchor: captured.anchor,
    });
    setDraft(null);
    setActiveId(thread.id);
  }

  const actions: ThreadActions = {
    async reply(threadId, content) {
      const thread = await reply.mutateAsync({ threadId, content });
      // Replying to a resolved thread reopens it.
      show(thread);
    },
    async edit(commentId, content) {
      await edit.mutateAsync({ commentId, content });
    },
    remove: (comment) => {
      remove.reset();
      setDeleting(comment);
    },
    async resolve(threadId, resolved) {
      const thread = await resolve.mutateAsync({ threadId, resolved });
      // A resolved thread leaves the text; a reopened one comes back to it.
      if (resolved)
        setActiveId((current) => (current === threadId ? null : current));
      else show(thread);
    },
  };

  const byId = new Map(threads.map((thread) => [thread.id, thread]));
  const handlers = useRef({ startDraft, show, byId, docked, canComment });
  handlers.current = { startDraft, show, byId, docked, canComment };
  // The editor is created once and keeps these callbacks.
  const editorComments = useMemo<DocumentEditorComments>(
    () => ({
      onEditor: setEditor,
      onThreadClick: (threadId) => {
        const current = handlers.current;
        const thread = current.byId.get(threadId);
        if (!thread) return;
        current.show(thread);
        // Over a narrow, editable document the panel would cover the text
        // someone only meant to put the caret in.
        if (current.docked || !current.canComment) setOpen(true);
      },
      ...(canComment ? { onAdd: () => handlers.current.startDraft() } : {}),
    }),
    [setEditor, canComment],
  );

  const attached = new Set(attachedIds);
  return {
    editor: editorComments,
    bodyChanged: recordAnchors,
    // Who an @ can name, in a comment or in the document itself.
    members,
    panelId,
    toggle,
    open,
    toggleOpen: () => (open ? close() : setOpen(true)),
    openCount: threads.filter((thread) => !thread.resolvedAt).length,
    panel: {
      id: panelId,
      docked,
      status: query.data
        ? ("ready" as const)
        : query.isError
          ? ("error" as const)
          : ("loading" as const),
      threads: sortThreads(threads, filter, attachedIds),
      filter,
      activeId,
      detachedIds: new Set(
        threads
          .filter((thread) => !attached.has(thread.id))
          .map((thread) => thread.id),
      ),
      canComment,
      currentUserId: user?.id,
      members,
      actions,
      notice: missing ? t("common:documentComments.notFound") : null,
      onFilterChange: setFilter,
      onActivate: setActiveId,
      onShow: (threadId: string) => {
        setRevealId(threadId);
        // Over a narrow document the panel hides the text it points at.
        if (!docked) setOpen(false);
      },
      onRetry: () => void query.refetch(),
      onClose: close,
    },
    draft: draft && {
      quote: draft.quote,
      truncated: draft.truncated,
      failedMessage: t(DRAFT_FAILURES[draftFailure]),
      members,
      onSubmit: submitDraft,
      onCancel: () => {
        const range = editor && getCommentHighlightState(editor)?.draft;
        setDraft(null);
        // Back to the text, with the same words selected.
        if (editor && !editor.isDestroyed && range)
          editor.chain().focus().setTextSelection(range).run();
      },
    },
    deleting: deleting && {
      thread: deleting.parentId === null,
      pending: remove.isPending,
      failed: remove.isError,
      onCancel: () => setDeleting(null),
      onConfirm: () =>
        void remove
          .mutateAsync(deleting.id)
          .then(() => setDeleting(null))
          .catch(() => {}),
    },
  };
}

export type DocumentComments = ReturnType<typeof useDocumentComments>;
