import type { Editor } from "@tiptap/core";
import { isAllowedUri } from "@tiptap/extension-link";
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
import { normalizeLinkHref } from "./normalize-link-href";

export function DocumentLinkDialog({
  editor,
  onClose,
}: {
  editor: Editor;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [value, setValue] = useState(
    String(editor.getAttributes("link").href ?? ""),
  );
  const [error, setError] = useState(false);
  const apply = () => {
    if (!editor.isEditable) return;
    const href = normalizeLinkHref(value);
    if (href && !isAllowedUri(href)) {
      setError(true);
      return;
    }
    const chain = editor.chain().focus().extendMarkRange("link");
    if (!href) chain.unsetLink().run();
    else if (editor.state.selection.empty && !editor.isActive("link"))
      chain
        .insertContent({
          type: "text",
          text: href,
          marks: [{ type: "link", attrs: { href } }],
        })
        .run();
    else chain.setLink({ href }).run();
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
          <DialogTitle>{t("common:documentEditor.linkTitle")}</DialogTitle>
        </DialogHeader>
        <div className="px-6 pb-5">
          <Input
            autoFocus
            aria-label={t("common:editor.link.label")}
            placeholder={t("common:editor.link.placeholder")}
            value={value}
            aria-invalid={error || undefined}
            onChange={(event) => {
              setValue(event.target.value);
              setError(false);
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
              {t("tasks:detail.editor.embed.errors.invalidUrl")}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose}>
            {t("common:actions.cancel")}
          </Button>
          <Button type="button" onClick={apply}>
            {t("common:editor.link.apply")}
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}
