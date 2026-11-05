import type { Editor } from "@tiptap/core";
import { Check, ChevronDown, Copy } from "lucide-react";
import { type RefObject, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/menu";

type CodeBlock = { pos: number; language: string; top: number; left: number };

export function DocumentCodeControls({
  editor,
  shell,
  languages,
}: {
  editor: Editor;
  shell: RefObject<HTMLDivElement | null>;
  languages: Set<string>;
}) {
  const { t } = useTranslation();
  const [block, setBlock] = useState<CodeBlock | null>(null);
  const [copied, setCopied] = useState(false);
  const timeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    const dom = editor.view.dom;
    const show = (element: HTMLElement) => {
      if (!shell.current) return;
      const pos = editor.view.posAtDOM(element, 0);
      const resolved = editor.state.doc.resolve(pos);
      const node = resolved.parent;
      if (node.type.name !== "codeBlock") return;
      const rect = element.getBoundingClientRect();
      const bounds = shell.current.getBoundingClientRect();
      setBlock({
        pos: resolved.before(),
        language: String(node.attrs.language || "auto"),
        top: rect.top - bounds.top + 6,
        left: rect.right - bounds.left - 8,
      });
    };
    const hover = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const code = target.closest<HTMLElement>("pre.kaneo-tiptap-codeblock");
      if (code) show(code);
      else setBlock(null);
    };
    const selection = () => {
      if (!editor.isActive("codeBlock")) return setBlock(null);
      const node = editor.view.domAtPos(editor.state.selection.from).node;
      const element = node instanceof HTMLElement ? node : node.parentElement;
      const code = element?.closest<HTMLElement>("pre.kaneo-tiptap-codeblock");
      if (code) show(code);
    };
    dom.addEventListener("mousemove", hover);
    editor.on("selectionUpdate", selection);
    return () => {
      dom.removeEventListener("mousemove", hover);
      editor.off("selectionUpdate", selection);
      if (timeout.current) clearTimeout(timeout.current);
    };
  }, [editor, shell]);
  if (!block) return null;
  const currentNode = editor.state.doc.nodeAt(block.pos);
  if (currentNode?.type.name !== "codeBlock") return null;

  return (
    <div
      className="kaneo-codeblock-language flex items-center gap-1"
      style={{ position: "absolute", top: block.top, left: block.left }}
    >
      {editor.isEditable && (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                type="button"
                size="xs"
                variant="ghost"
                className="bg-background/90"
              />
            }
            aria-label={t("common:documentEditor.codeLanguage")}
          >
            {block.language}
            <ChevronDown className="size-3" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuRadioGroup
              value={block.language}
              onValueChange={(language) => {
                editor
                  .chain()
                  .focus()
                  .setNodeSelection(block.pos)
                  .updateAttributes("codeBlock", {
                    language: language === "auto" ? "" : language,
                  })
                  .run();
                setBlock((current) =>
                  current ? { ...current, language } : current,
                );
              }}
            >
              <DropdownMenuRadioItem value="auto">
                {t("common:documentEditor.autoDetect")}
              </DropdownMenuRadioItem>
              {[...languages].sort().map((language) => (
                <DropdownMenuRadioItem key={language} value={language}>
                  {language}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      <Button
        type="button"
        size="icon-xs"
        variant="ghost"
        className="bg-background/90"
        aria-label={t("common:documentEditor.copyCode")}
        title={t("common:documentEditor.copyCode")}
        onClick={() => {
          void navigator.clipboard
            .writeText(currentNode.textContent)
            .then(() => {
              setCopied(true);
              if (timeout.current) clearTimeout(timeout.current);
              timeout.current = setTimeout(() => setCopied(false), 1500);
            })
            .catch(() => setCopied(false));
        }}
      >
        {copied ? (
          <Check className="size-3.5" />
        ) : (
          <Copy className="size-3.5" />
        )}
      </Button>
      {copied && (
        <span role="status" className="sr-only">
          {t("common:documentEditor.codeCopied")}
        </span>
      )}
    </div>
  );
}
