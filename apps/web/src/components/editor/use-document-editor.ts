import type { Editor } from "@tiptap/core";
import { EditorState, TextSelection, type Transaction } from "@tiptap/pm/state";
import { useEditor } from "@tiptap/react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { ResizableImage } from "@/components/task/extensions/resizable-image";
import { KaneoMention } from "@/components/task/extensions/kaneo-mention";
import { SHIKI_CODEBLOCK_REFRESH_META } from "@/components/task/extensions/shiki-code-block";
import {
  extractIssueKeyFromUrl,
  extractTaskIdFromUrl,
  isYouTubeUrl,
  normalizeUrl,
} from "@/lib/editor-url-utils";
import { pasteMarkdown } from "@/lib/paste-markdown";
import { insertUploadedAsset } from "./insert-uploaded-asset";
import { createEditorExtensions } from "./extensions";
import { DOCUMENT_END_LINE_META } from "./focus-document-end";
import { useEditorHighlighter } from "./use-editor-highlighter";
import type { DocumentEditorProps } from "./document-editor-types";
import type { SlashRange } from "./slash-commands";

export type DocumentEmbedRequest = { url: string; range?: SlashRange };

export function normalizeDocumentMarkdown(value: string) {
  return value.replace(/\r\n/g, "\n");
}

export function useDocumentEditor(
  props: DocumentEditorProps,
  onLink: () => void,
  onEmbed: (request: DocumentEmbedRequest) => void,
  onAttach: () => void,
) {
  const { t } = useTranslation();
  const current = useRef({ props, onLink, onEmbed, onAttach, t });
  current.current = { props, onLink, onEmbed, onAttach, t };
  const editorRef = useRef<Editor | null>(null);
  const syncing = useRef(false);
  const syncedValue = useRef(normalizeDocumentMarkdown(props.value));
  const documentKey = useRef(props.documentKey);
  const pending = useRef(0);
  const [uploadError, setUploadError] = useState("");
  const [uploading, setUploading] = useState(false);
  const mounted = useRef(true);
  const { highlighter, highlighterRef, languages } = useEditorHighlighter();
  const upload = useCallback(async (file: File, range?: SlashRange) => {
    const { props: options, t: translate } = current.current;
    const editor = editorRef.current;
    if (!editor?.isEditable || !options.uploadAsset) return;
    const originalKey = options.documentKey;
    let bookmark = range
      ? TextSelection.create(
          editor.state.doc,
          range.from,
          range.to,
        ).getBookmark()
      : editor.state.selection.getBookmark();
    const followEdits = ({ transaction }: { transaction: Transaction }) => {
      bookmark = bookmark.map(transaction.mapping);
    };
    editor.on("transaction", followEdits);
    pending.current += 1;
    setUploading(true);
    setUploadError("");
    options.onPendingUploadChange?.(true);
    try {
      const asset = await options.uploadAsset(file);
      if (
        !mounted.current ||
        editor.isDestroyed ||
        !editor.isEditable ||
        current.current.props.documentKey !== originalKey ||
        current.current.props.readOnly ||
        current.current.props.disabled
      )
        return;
      const destination = bookmark.resolve(editor.state.doc);
      insertUploadedAsset(
        editor,
        asset,
        translate("common:documentEditor.uploadFailed"),
        { from: destination.from, to: destination.to },
      );
    } catch (error) {
      if (mounted.current)
        setUploadError(
          error instanceof Error
            ? error.message
            : translate("common:documentEditor.uploadFailed"),
        );
    } finally {
      editor.off("transaction", followEdits);
      pending.current -= 1;
      if (mounted.current) {
        setUploading(pending.current > 0);
        current.current.props.onPendingUploadChange?.(pending.current > 0);
      }
    }
  }, []);

  const editor = useEditor(
    {
      immediatelyRender: false,
      editable: !props.readOnly && !props.disabled,
      content: props.value,
      contentType: "markdown",
      extensions: createEditorExtensions({
        // A page shows its hint on whichever empty line has the caret (see
        // index.css), so only paragraphs get it, and it is read through the
        // ref because the editor is created once.
        placeholder:
          props.variant === "page"
            ? ({ node }) =>
                node.type.name === "paragraph"
                  ? (current.current.props.placeholder ?? "")
                  : ""
            : (props.placeholder ?? ""),
        highlighter: () => highlighterRef.current,
        resolveLanguage: (language) =>
          (
            ({ plaintext: "text", excel: "csv", reasonml: "ocaml" }) as Record<
              string,
              string
            >
          )[language] ?? language,
        image: ResizableImage,
        extra: [KaneoMention],
      }),
      editorProps: {
        attributes: {
          class: "kaneo-tiptap-prose",
          role: "textbox",
          "aria-label": props.ariaLabel,
          "aria-multiline": "true",
        },
        handlePaste: (view, event) => {
          const active = editorRef.current;
          if (!active?.isEditable) return false;
          const file = event.clipboardData?.files[0];
          if (file && current.current.props.uploadAsset) {
            event.preventDefault();
            void upload(file);
            return true;
          }
          if (pasteMarkdown(active, event)) return true;
          const text = event.clipboardData?.getData("text/plain").trim() ?? "";
          const url = /\s/.test(text) ? null : normalizeUrl(text);
          if (!url) return false;
          const issueKey = extractIssueKeyFromUrl(url);
          const taskId = extractTaskIdFromUrl(url);
          if (issueKey || taskId) {
            event.preventDefault();
            view.dispatch(
              view.state.tr.replaceSelectionWith(
                view.state.schema.nodes.kaneoIssueLink.create({
                  url,
                  issueKey: issueKey ?? "",
                  taskId: taskId ?? "",
                }),
              ),
            );
            return true;
          }
          if (!isYouTubeUrl(url)) return false;
          event.preventDefault();
          const from = view.state.selection.from;
          active
            .chain()
            .insertContent({
              type: "text",
              text: url,
              marks: [{ type: "link", attrs: { href: url } }],
            })
            .run();
          current.current.onEmbed({
            url,
            range: { from, to: from + url.length },
          });
          return true;
        },
        handleDrop: (view, event) => {
          const file = event.dataTransfer?.files[0];
          if (
            !editorRef.current?.isEditable ||
            !file ||
            !current.current.props.uploadAsset
          )
            return false;
          event.preventDefault();
          const position = view.posAtCoords({
            left: event.clientX,
            top: event.clientY,
          });
          void upload(
            file,
            position ? { from: position.pos, to: position.pos } : undefined,
          );
          return true;
        },
        handleKeyDown: (view, event) => {
          if (!editorRef.current?.isEditable) return false;
          const mod = event.metaKey || event.ctrlKey;
          if (
            mod &&
            !event.altKey &&
            !event.shiftKey &&
            event.key.toLowerCase() === "k"
          ) {
            event.preventDefault();
            current.current.onLink();
            return true;
          }
          if (
            mod &&
            event.shiftKey &&
            !event.altKey &&
            event.key.toLowerCase() === "u" &&
            current.current.props.uploadAsset
          ) {
            event.preventDefault();
            current.current.onAttach();
            return true;
          }
          if (
            mod &&
            event.key.toLowerCase() === "a" &&
            view.state.selection.$from.parent.type.name === "codeBlock"
          ) {
            event.preventDefault();
            const { $from } = view.state.selection;
            view.dispatch(
              view.state.tr.setSelection(
                TextSelection.create(
                  view.state.doc,
                  $from.start(),
                  $from.end(),
                ),
              ),
            );
            return true;
          }
          return false;
        },
        handleTextInput: (view, _from, _to, text) => {
          const { $from } = view.state.selection;
          if (
            !editorRef.current?.isEditable ||
            text !== "`" ||
            $from.parent.type.name !== "paragraph"
          )
            return false;
          const before = $from.parent.textBetween(
            0,
            $from.parentOffset,
            "\0",
            "\0",
          );
          if (!/^\s*``$/.test(before)) return false;
          const start = $from.before();
          const code = view.state.schema.nodes.codeBlock.create();
          const transaction = view.state.tr.replaceWith(
            start,
            start + $from.parent.nodeSize,
            code,
          );
          transaction.setSelection(
            TextSelection.near(transaction.doc.resolve(start + 1)),
          );
          view.dispatch(transaction.scrollIntoView());
          return true;
        },
      },
      onUpdate: ({ editor: active, transaction }) => {
        const options = current.current.props;
        if (
          syncing.current ||
          transaction.getMeta(DOCUMENT_END_LINE_META) ||
          !active.isEditable ||
          options.readOnly ||
          options.disabled
        )
          return;
        const markdown = normalizeDocumentMarkdown(active.getMarkdown());
        if (markdown === syncedValue.current) return;
        syncedValue.current = markdown;
        options.onChange?.(markdown);
      },
    },
    [],
  );
  editorRef.current = editor;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useLayoutEffect(() => {
    if (!editor) return;
    syncing.current = true;
    const editable = !props.readOnly && !props.disabled;
    if (editor.isEditable !== editable) editor.setEditable(editable);
    editor.view.dom.setAttribute("aria-label", props.ariaLabel);
    if (props.readOnly && props.onRequestEdit) {
      editor.view.dom.setAttribute("tabindex", "0");
      editor.view.dom.setAttribute("data-document-edit", "");
      editor.view.dom.setAttribute("aria-keyshortcuts", "Enter Space");
    } else {
      editor.view.dom.removeAttribute("tabindex");
      editor.view.dom.removeAttribute("data-document-edit");
      editor.view.dom.removeAttribute("aria-keyshortcuts");
    }
    editor.view.dom.setAttribute(
      "aria-readonly",
      String(Boolean(props.readOnly)),
    );
    const incoming = normalizeDocumentMarkdown(props.value);
    const changedDocument = documentKey.current !== props.documentKey;
    if (changedDocument || incoming !== syncedValue.current) {
      editor.commands.setContent(incoming, {
        emitUpdate: false,
        contentType: "markdown",
      });
      if (changedDocument) {
        const { schema, plugins, doc } = editor.state;
        editor.view.updateState(EditorState.create({ schema, plugins, doc }));
      }
      syncedValue.current = incoming;
      documentKey.current = props.documentKey;
    }
    syncing.current = false;
  }, [
    editor,
    props.ariaLabel,
    props.value,
    props.readOnly,
    props.disabled,
    props.documentKey,
    props.onRequestEdit,
  ]);

  useEffect(() => {
    if (!editor) return;
    const refresh = () =>
      editor.view.dispatch(
        editor.state.tr.setMeta(SHIKI_CODEBLOCK_REFRESH_META, true),
      );
    if (highlighter) refresh();
    const observer = new MutationObserver(refresh);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
    return () => observer.disconnect();
  }, [editor, highlighter]);

  return { editor, upload, uploading, uploadError, languages };
}
