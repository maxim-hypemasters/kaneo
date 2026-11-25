import type { Editor } from "@tiptap/core";
import { useEffect, useMemo, useState } from "react";
import type { CommentRange } from "@/components/editor/comments/comment-anchor";
import {
  getCommentHighlightState,
  retryDetachedThreads,
  setActiveThread,
  setDraftRange,
  setTrackedThreads,
} from "@/components/editor/comments/comment-highlights";
import type { DocumentCommentThread } from "@/fetchers/document-comment/types";

// Undo, or a block moved back, can return text a thread lost. Looking again
// shortly after typing stops finds it without searching on every keystroke.
const RETRY_DELAY_MS = 400;

function attachedInOrder(editor: Editor) {
  const state = getCommentHighlightState(editor);
  if (!state) return [];
  return [...state.ranges]
    .sort(([, a], [, b]) => a.from - b.from || a.to - b.to)
    .map(([id]) => id);
}

// Keeps the document's highlights in step with the threads, and reports
// which threads are found in the text, in the order they appear.
export function useCommentHighlights({
  threads,
  activeId,
  draftRange,
}: {
  threads: readonly DocumentCommentThread[];
  activeId: string | null;
  // The selection a new comment is being written on.
  draftRange: CommentRange | null;
}) {
  const [editor, setEditor] = useState<Editor | null>(null);
  const [attachedIds, setAttachedIds] = useState<string[]>([]);
  const tracked = useMemo(
    () =>
      threads.map((thread) => ({
        id: thread.id,
        anchor: thread.anchor,
        visible: !thread.resolvedAt,
      })),
    [threads],
  );

  useEffect(() => {
    if (editor && !editor.isDestroyed) setTrackedThreads(editor, tracked);
  }, [editor, tracked]);
  useEffect(() => {
    if (editor && !editor.isDestroyed) setActiveThread(editor, activeId);
  }, [editor, activeId]);
  useEffect(() => {
    if (editor && !editor.isDestroyed) setDraftRange(editor, draftRange);
  }, [editor, draftRange]);

  useEffect(() => {
    if (!editor) {
      setAttachedIds([]);
      return;
    }
    let retry: ReturnType<typeof setTimeout> | null = null;
    const read = () => {
      const next = attachedInOrder(editor);
      // Typing fires this on every keystroke; only a real change re-renders.
      setAttachedIds((current) =>
        current.length === next.length &&
        current.every((id, index) => id === next[index])
          ? current
          : next,
      );
    };
    const onTransaction = ({
      transaction,
    }: {
      transaction: { docChanged: boolean };
    }) => {
      read();
      if (!transaction.docChanged) return;
      const state = getCommentHighlightState(editor);
      if (!state || state.ranges.size === state.tracked.length) return;
      if (retry !== null) clearTimeout(retry);
      retry = setTimeout(() => {
        retry = null;
        if (!editor.isDestroyed) retryDetachedThreads(editor);
      }, RETRY_DELAY_MS);
    };
    read();
    editor.on("transaction", onTransaction);
    return () => {
      editor.off("transaction", onTransaction);
      if (retry !== null) clearTimeout(retry);
    };
  }, [editor]);

  return { editor, setEditor, attachedIds };
}
