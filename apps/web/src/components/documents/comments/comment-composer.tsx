import { Extension } from "@tiptap/core";
import Placeholder from "@tiptap/extension-placeholder";
import { EditorContent, useEditor } from "@tiptap/react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useDocumentDraftGuard } from "@/components/editor/document-draft-guard";
import type { MentionMember } from "@/components/task/extensions/mention-list";
import { MentionSuggestion } from "@/components/task/extensions/mention-suggestion";
import { Button } from "@/components/ui/button";
import { commentExtensions } from "./comment-extensions";

// Writes a new comment, a reply, or an edit. The text stays in place when
// posting fails, so it can be sent again.
export function CommentComposer({
  initialContent = "",
  placeholder,
  submitLabel,
  failedMessage,
  members,
  autoFocus = false,
  onSubmit,
  onCancel,
}: {
  initialContent?: string;
  placeholder: string;
  submitLabel: string;
  failedMessage: string;
  members: MentionMember[];
  autoFocus?: boolean;
  // Rejects when the comment could not be posted.
  onSubmit: (content: string) => Promise<void>;
  onCancel?: () => void;
}) {
  const { t } = useTranslation();
  const [dirty, setDirty] = useState(false);
  const [empty, setEmpty] = useState(!initialContent.trim());
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const mounted = useRef(true);
  const mentionOpen = useRef(false);
  // The editor is created once, so its keys and mention list read these.
  const latest = useRef({ members, submit });
  latest.current = { members, submit };

  const editor = useEditor(
    {
      immediatelyRender: false,
      content: initialContent,
      contentType: "markdown",
      extensions: [
        ...commentExtensions(),
        Placeholder.configure({ placeholder }),
        MentionSuggestion.configure({
          getMembers: () => latest.current.members,
        }),
        // Ahead of the hard break that Mod-Enter would otherwise insert.
        Extension.create({
          name: "commentSubmit",
          priority: 1000,
          addKeyboardShortcuts: () => ({
            "Mod-Enter": () => {
              void latest.current.submit();
              return true;
            },
          }),
        }),
      ],
      editorProps: {
        attributes: {
          class: "kaneo-comment-editor-prose min-h-9 text-[13px] outline-none",
          role: "textbox",
          "aria-multiline": "true",
          "aria-label": placeholder,
        },
      },
      onUpdate: ({ editor: active }) => {
        setDirty(true);
        setEmpty(active.isEmpty);
        setFailed(false);
      },
    },
    [],
  );

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    if (autoFocus) editor?.commands.focus("end");
  }, [editor, autoFocus]);
  useEffect(() => {
    editor?.setEditable(!pending);
  }, [editor, pending]);

  function clear() {
    editor?.commands.clearContent();
    setDirty(false);
    setEmpty(true);
    setFailed(false);
  }
  useDocumentDraftGuard({
    dirty: dirty && !empty,
    saving: pending,
    onDiscard: clear,
  });

  async function submit() {
    if (!editor || editor.isEmpty || pending) return;
    const content = editor.getMarkdown().trim();
    if (!content) return;
    setPending(true);
    setFailed(false);
    try {
      await onSubmit(content);
      if (mounted.current) clear();
    } catch {
      if (mounted.current) setFailed(true);
    } finally {
      if (mounted.current) setPending(false);
    }
  }

  return (
    <div
      role="presentation"
      className="flex flex-col gap-2"
      // Noted on the way down: by the time the key comes back up, an open
      // mention list has taken it and closed.
      onKeyDownCapture={(event) => {
        if (event.key === "Escape")
          mentionOpen.current =
            window.document.querySelector(".kaneo-mention-popup") !== null;
      }}
      onKeyDown={(event) => {
        if (event.key !== "Escape") return;
        // The document fills a dialog that Escape would close.
        event.stopPropagation();
        if (!mentionOpen.current && !pending) onCancel?.();
      }}
    >
      <div className="rounded-lg border border-input bg-background px-2.5 py-1.5 focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/24">
        <EditorContent editor={editor} />
      </div>
      {failed && (
        <p role="alert" className="text-destructive text-xs">
          {failedMessage}
        </p>
      )}
      <div className="flex justify-end gap-1.5">
        {onCancel && (
          <Button
            type="button"
            variant="ghost"
            size="xs"
            disabled={pending}
            onClick={onCancel}
          >
            {t("common:actions.cancel")}
          </Button>
        )}
        <Button
          type="button"
          size="xs"
          disabled={empty || pending}
          loading={pending}
          onClick={() => void submit()}
        >
          {submitLabel}
        </Button>
      </div>
    </div>
  );
}
