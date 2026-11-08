import { EditorContent } from "@tiptap/react";
import { Maximize2, Minimize2 } from "lucide-react";
import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { ToolbarButton } from "@/components/ui/toolbar";
import {
  Dialog,
  DialogHeader,
  DialogPopup,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/cn";
import { DocumentCodeControls } from "./document-code-controls";
import { DocumentEmbedDialog } from "./document-embed-dialog";
import { DocumentFormattingMenu } from "./document-formatting-menu";
import { DocumentLinkDialog } from "./document-link-dialog";
import { DocumentSlashMenu } from "./document-slash-menu";
import { DocumentToolbar } from "./document-toolbar";
import type { DocumentEditorProps } from "./document-editor-types";
import { focusDocumentEnd } from "./focus-document-end";
import {
  type DocumentEmbedRequest,
  useDocumentEditor,
} from "./use-document-editor";

export type {
  DocumentEditorHandle,
  DocumentEditorProps,
  UploadedDocumentAsset,
} from "./document-editor-types";

export function DocumentEditor(props: DocumentEditorProps) {
  const { t } = useTranslation();
  const [fullscreen, setFullscreen] = useState(false);
  const [isLinkOpen, setLinkOpen] = useState(false);
  const [embed, setEmbed] = useState<DocumentEmbedRequest | null>(null);
  const [previewImage, setPreviewImage] = useState<{
    src: string;
    alt: string;
  } | null>(null);
  const [host] = useState(() =>
    typeof document === "undefined" ? null : document.createElement("div"),
  );
  const inlineSlot = useRef<HTMLDivElement>(null);
  const fullscreenSlot = useRef<HTMLDivElement>(null);
  const shell = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const expandButton = useRef<HTMLButtonElement>(null);
  const editPosition = useRef<number | "end" | null>(null);
  const uploadRange = useRef<{ from: number; to: number } | undefined>(
    undefined,
  );
  const openLink = useCallback(() => setLinkOpen(true), []);
  const openEmbed = useCallback(() => setEmbed({ url: "" }), []);
  const chooseFile = useCallback((imagesOnly = false) => {
    const input = fileInput.current;
    if (!input) return;
    input.accept = imagesOnly ? "image/*" : "";
    input.click();
  }, []);
  const { editor, upload, uploading, uploadError, languages } =
    useDocumentEditor(props, openLink, setEmbed, chooseFile);
  const editable = !props.readOnly;
  const page = props.variant === "page";
  const expandable = props.expandable ?? true;
  const locked = Boolean(props.disabled || uploading);
  const canActivate = Boolean(props.readOnly && props.onRequestEdit && !locked);

  useImperativeHandle(
    props.ref,
    () => ({
      focus: (position) => {
        if (!editor?.isEditable) return;
        editor.commands.focus(position);
        // TipTap focuses the DOM a frame later; keys typed right after
        // (Enter in the title, then typing) would still reach the old field.
        editor.view.focus();
      },
    }),
    [editor],
  );

  useLayoutEffect(() => {
    if (!editor?.isEditable || editPosition.current === null) return;
    const position = editPosition.current;
    editPosition.current = null;
    editor.commands.focus(position);
  }, [editor, props.readOnly]);
  const openFile = useCallback(
    (imagesOnly = false) => {
      if (!editor || locked || !props.uploadAsset) return;
      uploadRange.current = {
        from: editor.state.selection.from,
        to: editor.state.selection.to,
      };
      chooseFile(imagesOnly);
    },
    [editor, locked, props.uploadAsset, chooseFile],
  );

  useLayoutEffect(() => {
    if (!host) return;
    const slot = fullscreen ? fullscreenSlot.current : inlineSlot.current;
    slot?.appendChild(host);
  }, [fullscreen, host]);
  useEffect(
    () => () => {
      host?.remove();
    },
    [host],
  );

  const content =
    editor && host
      ? createPortal(
          <div
            className={cn(
              "flex min-h-0 flex-col",
              fullscreen && "h-full",
              page && "flex-1",
            )}
          >
            {editable && !page && (
              <div className="sticky top-0 z-20 shrink-0 border-b bg-background px-2 py-2 sm:px-3">
                <DocumentToolbar
                  editor={editor}
                  disabled={locked}
                  canUpload={Boolean(props.uploadAsset)}
                  onUpload={openFile}
                  onLink={openLink}
                  onEmbed={openEmbed}
                  endActions={
                    !fullscreen ? (
                      <>
                        {props.headerActions}
                        {expandable && (
                          <ToolbarButton
                            ref={expandButton}
                            render={
                              <Button
                                type="button"
                                size="icon-sm"
                                variant="ghost"
                              />
                            }
                            aria-label={t("common:documentEditor.expand")}
                            title={t("common:documentEditor.expand")}
                            disabled={locked}
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => setFullscreen(true)}
                          >
                            <Maximize2 className="size-4" />
                          </ToolbarButton>
                        )}
                      </>
                    ) : undefined
                  }
                />
              </div>
            )}
            <div
              className={cn(
                "min-h-0",
                fullscreen && "flex-1 overflow-y-auto overscroll-contain",
                page && "flex flex-1 flex-col",
              )}
            >
              {props.notice && (
                <div
                  className={cn(
                    page ? "pb-4" : "px-3 pt-3 sm:px-4",
                    fullscreen && "mx-auto w-full max-w-4xl",
                  )}
                >
                  {props.notice}
                </div>
              )}
              <div
                ref={shell}
                role="presentation"
                data-variant={page ? "page" : undefined}
                className={cn(
                  "kaneo-tiptap-shell relative",
                  page ? "flex flex-1 flex-col" : "px-3 sm:px-4",
                  fullscreen && "mx-auto w-full max-w-4xl px-5 py-8 sm:px-10",
                  editable && !page && "[&_.ProseMirror]:min-h-44",
                  !editable && "[&_.ProseMirror]:pb-2",
                  !editable &&
                    !fullscreen &&
                    (expandable || props.headerActions) &&
                    "min-h-8 [&_.ProseMirror]:pe-9",
                  canActivate &&
                    "cursor-text rounded-lg focus-within:ring-2 focus-within:ring-ring",
                )}
                onClick={(event) => {
                  const target = event.target;
                  if (
                    target instanceof HTMLImageElement &&
                    target.classList.contains("kaneo-editor-image")
                  ) {
                    event.preventDefault();
                    setPreviewImage({
                      src: target.currentSrc || target.src,
                      alt: target.alt,
                    });
                    return;
                  }
                  if (!canActivate || !editor || event.defaultPrevented) return;
                  if (
                    !(target instanceof Element) ||
                    target.closest(
                      "a, button, input, select, textarea, img, iframe, [role='button'], [role='checkbox']",
                    ) ||
                    !window.getSelection()?.isCollapsed
                  )
                    return;
                  editPosition.current = event.detail
                    ? (editor.view.posAtCoords({
                        left: event.clientX,
                        top: event.clientY,
                      })?.pos ?? "end")
                    : "end";
                  props.onRequestEdit?.();
                }}
                onKeyDown={(event) => {
                  if (
                    !canActivate ||
                    event.target !== editor?.view.dom ||
                    event.ctrlKey ||
                    event.metaKey ||
                    event.altKey ||
                    (event.key !== "Enter" && event.key !== " ")
                  )
                    return;
                  event.preventDefault();
                  editPosition.current = "end";
                  props.onRequestEdit?.();
                }}
              >
                {!editable &&
                  !fullscreen &&
                  (expandable || props.headerActions) && (
                    <div className="absolute right-1 top-0 z-10 flex items-center gap-2">
                      {props.headerActions}
                      {expandable && (
                        <Button
                          ref={expandButton}
                          type="button"
                          size="icon-sm"
                          variant="ghost"
                          aria-label={t("common:documentEditor.expand")}
                          title={t("common:documentEditor.expand")}
                          disabled={locked}
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={() => setFullscreen(true)}
                        >
                          <Maximize2 className="size-4" />
                        </Button>
                      )}
                    </div>
                  )}
                {!props.value && props.readOnly && (
                  <p className="py-3 text-muted-foreground text-sm">
                    {props.placeholder || t("common:documentEditor.empty")}
                  </p>
                )}
                <EditorContent
                  editor={editor}
                  className="kaneo-tiptap-content"
                />
                {page && (
                  // Clicking below the text continues the document; on a
                  // read-only page this is just bottom space.
                  <div
                    aria-hidden
                    data-slot="document-editor-tail"
                    className={cn("min-h-32 flex-1", editable && "cursor-text")}
                    onMouseDown={(event) => {
                      if (event.button !== 0 || !editor.isEditable) return;
                      event.preventDefault();
                      focusDocumentEnd(editor);
                    }}
                  />
                )}
                {editable && !locked && (
                  <>
                    <DocumentFormattingMenu editor={editor} onLink={openLink} />
                    <DocumentSlashMenu
                      editor={editor}
                      shell={shell}
                      canUpload={Boolean(props.uploadAsset)}
                      onUpload={openFile}
                      onLink={openLink}
                      onEmbed={openEmbed}
                    />
                  </>
                )}
                <DocumentCodeControls
                  editor={editor}
                  shell={shell}
                  languages={languages}
                />
              </div>
              {uploadError && (
                <p
                  role="alert"
                  className={cn(
                    "py-2 text-destructive text-sm",
                    !page && "px-4",
                  )}
                >
                  {uploadError}
                </p>
              )}
              {uploading && (
                <p
                  role="status"
                  className={cn(
                    "py-2 text-muted-foreground text-sm",
                    !page && "px-4",
                  )}
                >
                  {t("common:documentEditor.uploading")}
                </p>
              )}
            </div>
            {props.footer && (
              <div
                className="sticky bottom-0 z-20 flex shrink-0 flex-wrap items-center justify-end gap-2 border-t bg-background px-3 py-3 sm:px-4"
                data-slot="document-editor-footer"
              >
                {props.footer}
              </div>
            )}
          </div>,
          host,
        )
      : null;

  return (
    <section
      aria-label={props.ariaLabel}
      className={cn("min-w-0", page && "flex flex-1 flex-col", props.className)}
      data-document-editor=""
      data-readonly={props.readOnly || undefined}
    >
      <div
        ref={(node) => {
          inlineSlot.current = node;
          if (node && host && !fullscreen && host.parentElement !== node)
            node.appendChild(host);
        }}
        className={cn(
          editable && !page && "rounded-xl border border-border bg-background",
          page &&
            "flex min-h-0 flex-1 flex-col [&>div]:flex [&>div]:min-h-0 [&>div]:flex-1 [&>div]:flex-col",
          fullscreen && "hidden",
        )}
      />
      {content}
      <input
        ref={fileInput}
        type="file"
        className="sr-only"
        disabled={locked || !editable}
        aria-label={t("common:documentEditor.file")}
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) void upload(file, uploadRange.current);
          uploadRange.current = undefined;
        }}
      />
      <Dialog
        open={fullscreen}
        onOpenChange={(open) => {
          if (!locked) setFullscreen(open);
        }}
      >
        <DialogPopup
          fullscreen
          showCloseButton={false}
          initialFocus={false}
          finalFocus={() => expandButton.current}
          className="bg-background"
        >
          <DialogHeader className="flex-row items-center justify-between gap-3 border-b px-4 py-3 sm:px-6">
            <DialogTitle className="truncate text-base">
              {props.ariaLabel}
            </DialogTitle>
            <div className="flex items-center gap-2">
              {props.headerActions}
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                disabled={locked}
                aria-label={t("common:documentEditor.collapse")}
                title={t("common:documentEditor.collapse")}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => setFullscreen(false)}
              >
                <Minimize2 className="size-4" />
              </Button>
            </div>
          </DialogHeader>
          <div
            ref={(node) => {
              fullscreenSlot.current = node;
              if (node && host && fullscreen && host.parentElement !== node)
                node.appendChild(host);
            }}
            className="flex min-h-0 flex-1 flex-col [&>div]:flex [&>div]:min-h-0 [&>div]:flex-1 [&>div]:flex-col"
            data-slot="dialog-panel"
          />
        </DialogPopup>
      </Dialog>
      {editor && isLinkOpen && (
        <DocumentLinkDialog
          editor={editor}
          onClose={() => setLinkOpen(false)}
        />
      )}
      {editor && embed && (
        <DocumentEmbedDialog
          editor={editor}
          request={embed}
          onClose={() => setEmbed(null)}
        />
      )}
      <Dialog
        open={Boolean(previewImage)}
        onOpenChange={(open) => {
          if (!open) setPreviewImage(null);
        }}
      >
        <DialogPopup bottomStickOnMobile={false} className="max-w-6xl">
          <DialogTitle className="sr-only">
            {previewImage?.alt || t("common:documentEditor.image")}
          </DialogTitle>
          {previewImage && (
            <img
              src={previewImage.src}
              alt={previewImage.alt}
              className="max-h-[85dvh] w-full object-contain"
            />
          )}
        </DialogPopup>
      </Dialog>
    </section>
  );
}

export default DocumentEditor;
