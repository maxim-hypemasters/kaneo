import type { Editor } from "@tiptap/core";
import { BubbleMenu } from "@tiptap/react/menus";
import {
  Bold,
  Code,
  Italic,
  Link2,
  Strikethrough,
  Underline,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { selectionStartAnchor } from "./selection-start-anchor";
import { TableToolbar } from "./table-toolbar";

export function DocumentFormattingMenu({
  editor,
  onLink,
}: {
  editor: Editor;
  onLink: () => void;
}) {
  const { t } = useTranslation();
  const actions = [
    {
      label: t("common:documentEditor.bold"),
      icon: Bold,
      mark: "bold",
      run: () => editor.chain().focus().toggleBold().run(),
    },
    {
      label: t("common:documentEditor.italic"),
      icon: Italic,
      mark: "italic",
      run: () => editor.chain().focus().toggleItalic().run(),
    },
    {
      label: t("common:documentEditor.underline"),
      icon: Underline,
      mark: "underline",
      run: () => editor.chain().focus().toggleUnderline().run(),
    },
    {
      label: t("common:documentEditor.strike"),
      icon: Strikethrough,
      mark: "strike",
      run: () => editor.chain().focus().toggleStrike().run(),
    },
    {
      label: t("common:documentEditor.inlineCode"),
      icon: Code,
      mark: "code",
      run: () => editor.chain().focus().toggleCode().run(),
    },
    {
      label: t("common:documentEditor.link"),
      icon: Link2,
      mark: "link",
      run: onLink,
    },
  ];
  return (
    <>
      <BubbleMenu
        editor={editor}
        className="kaneo-tiptap-bubble"
        pluginKey="document-formatting"
        getReferencedVirtualElement={() => selectionStartAnchor(editor)}
        shouldShow={({ from, to }) =>
          editor.isEditable && from !== to && !editor.isActive("codeBlock")
        }
      >
        {actions.map((action) => (
          <Button
            key={action.mark}
            type="button"
            size="icon-sm"
            variant="ghost"
            aria-label={action.label}
            title={action.label}
            aria-pressed={editor.isActive(action.mark)}
            className={cn(
              "kaneo-tiptap-bubble-btn",
              editor.isActive(action.mark) && "bg-accent",
            )}
            onMouseDown={(event) => event.preventDefault()}
            onClick={action.run}
          >
            <action.icon className="size-3.5" />
          </Button>
        ))}
      </BubbleMenu>
      <BubbleMenu
        editor={editor}
        className="kaneo-tiptap-bubble"
        pluginKey="document-table"
        shouldShow={() => editor.isEditable && editor.isActive("table")}
      >
        <TableToolbar
          editor={editor}
          className="kaneo-tiptap-bubble-btn"
          labels={{
            addColumnBefore: t("tasks:editor.table.addColumnBefore"),
            addColumnAfter: t("tasks:editor.table.addColumnAfter"),
            deleteColumn: t("tasks:editor.table.deleteColumn"),
            addRowBefore: t("tasks:editor.table.addRowBefore"),
            addRowAfter: t("tasks:editor.table.addRowAfter"),
            deleteRow: t("tasks:editor.table.deleteRow"),
            deleteTable: t("tasks:editor.table.deleteTable"),
          }}
        />
      </BubbleMenu>
    </>
  );
}
