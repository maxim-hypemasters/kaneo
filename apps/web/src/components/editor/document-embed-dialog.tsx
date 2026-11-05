import type { Editor } from "@tiptap/core";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogFooter,
  DialogHeader,
  DialogPopup,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { isYouTubeUrl, normalizeUrl } from "@/lib/editor-url-utils";
import type { DocumentEmbedRequest } from "./use-document-editor";

export function DocumentEmbedDialog({
  editor,
  request,
  onClose,
}: {
  editor: Editor;
  request: DocumentEmbedRequest;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [url, setUrl] = useState(request.url);
  const [error, setError] = useState("");
  const apply = () => {
    if (!editor.isEditable) return;
    const normalized = normalizeUrl(url);
    if (!normalized || !isYouTubeUrl(normalized))
      return setError(t("tasks:detail.editor.embed.errors.onlyYoutube"));
    const chain = editor.chain().focus();
    if (request.range) chain.deleteRange(request.range);
    chain
      .insertContent({
        type: "embedBlock",
        attrs: { url: normalized, mode: "embed" },
      })
      .run();
    onClose();
  };
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogPopup
        bottomStickOnMobile={false}
        className="max-w-sm"
        finalFocus={() => (editor.isDestroyed ? false : editor.view.dom)}
      >
        <DialogHeader>
          <DialogTitle>{t("common:documentEditor.embedTitle")}</DialogTitle>
        </DialogHeader>
        <div className="px-6 pb-5">
          <Input
            autoFocus
            inputMode="url"
            aria-label={t("common:documentEditor.embedTitle")}
            placeholder={t("common:documentEditor.embedPlaceholder")}
            value={url}
            onChange={(event) => {
              setUrl(event.target.value);
              setError("");
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                event.stopPropagation();
                apply();
              }
            }}
          />
          {error && (
            <p role="alert" className="mt-2 text-destructive text-sm">
              {error}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose}>
            {t("common:actions.cancel")}
          </Button>
          <Button type="button" onClick={apply}>
            {t("common:documentEditor.insertEmbed")}
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}
