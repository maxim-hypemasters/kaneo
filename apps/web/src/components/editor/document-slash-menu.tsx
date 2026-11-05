import type { Editor } from "@tiptap/core";
import { type RefObject, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/cn";
import {
  richTextCommands,
  type SlashCommand,
  type SlashRange,
} from "./slash-commands";

type SlashState = SlashRange & {
  query: string;
  top: number;
  left: number;
  index: number;
};

export function DocumentSlashMenu({
  editor,
  shell,
  canUpload,
  onUpload,
  onEmbed,
}: {
  editor: Editor;
  shell: RefObject<HTMLDivElement | null>;
  canUpload: boolean;
  onUpload: () => void;
  onEmbed: () => void;
}) {
  const { t } = useTranslation();
  const [state, setState] = useState<SlashState | null>(null);
  const commands = useMemo(() => {
    const labels: Record<string, string> = {
      paragraph: t("common:documentEditor.paragraph"),
      "heading-2": t("common:documentEditor.heading2"),
      "bullet-list": t("common:documentEditor.bulletedList"),
      "task-list": t("common:documentEditor.checklist"),
      "ordered-list": t("common:documentEditor.numberedList"),
      blockquote: t("common:documentEditor.quote"),
      "code-block": t("common:documentEditor.codeBlock"),
      table: t("common:documentEditor.table"),
    };
    const items = richTextCommands.map((command) => ({
      ...command,
      label: labels[command.id],
    }));
    for (const level of [1, 3] as const) {
      items.splice(level === 1 ? 1 : 3, 0, {
        id: `heading-${level}`,
        label:
          level === 1
            ? t("common:documentEditor.heading1")
            : t("common:documentEditor.heading3"),
        group: "text",
        search: `heading title h${level}`,
        run: (active, range) => {
          active.chain().focus().deleteRange(range).setHeading({ level }).run();
        },
      });
    }
    if (canUpload)
      items.push({
        id: "file",
        label: t("common:documentEditor.file"),
        group: "insert",
        search: "image picture file upload attachment",
        run: (active, range) => {
          active.chain().focus().deleteRange(range).run();
          onUpload();
        },
      });
    items.push({
      id: "embed",
      label: t("common:documentEditor.embed"),
      group: "insert",
      search: "embed youtube video",
      run: (active, range) => {
        active.chain().focus().deleteRange(range).run();
        onEmbed();
      },
    });
    return items;
  }, [canUpload, onUpload, onEmbed, t]);
  const query = state?.query.toLowerCase() ?? "";
  const filtered = commands.filter(
    (command) =>
      !query ||
      command.label.toLowerCase().includes(query) ||
      command.search.includes(query),
  );
  const latest = useRef({ state, filtered });
  latest.current = { state, filtered };
  const run = (command: SlashCommand, range: SlashRange) => {
    if (!editor.isEditable) return;
    command.run(editor, range);
    setState(null);
  };

  useEffect(() => {
    const sync = () => {
      if (
        !editor.isEditable ||
        !editor.state.selection.empty ||
        !editor.isFocused
      )
        return setState(null);
      const { $from } = editor.state.selection;
      if ($from.parent.type.name === "codeBlock") return setState(null);
      const match = /(?:^|\s)\/([^\s/]*)$/.exec(
        $from.parent.textBetween(0, $from.parentOffset, "\n", "\0"),
      );
      if (!match || !shell.current) return setState(null);
      const nextQuery = match[1] ?? "";
      const coords = editor.view.coordsAtPos($from.pos);
      const bounds = shell.current.getBoundingClientRect();
      setState((previous) => ({
        from: $from.pos - nextQuery.length - 1,
        to: $from.pos,
        query: nextQuery,
        top: coords.bottom - bounds.top + 4,
        left: Math.max(
          0,
          Math.min(coords.left - bounds.left, bounds.width - 256),
        ),
        index: previous?.query === nextQuery ? previous.index : 0,
      }));
    };
    const keydown = (event: KeyboardEvent) => {
      const { state: current, filtered: options } = latest.current;
      if (
        !current ||
        !editor.isFocused ||
        !editor.isEditable ||
        event.isComposing
      )
        return;
      if (
        !["Escape", "ArrowDown", "ArrowUp", "Enter", "Tab"].includes(event.key)
      )
        return;
      event.preventDefault();
      event.stopPropagation();
      if (event.key === "Escape") return setState(null);
      if (!options.length) return;
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        const delta = event.key === "ArrowDown" ? 1 : -1;
        setState((previous) =>
          previous
            ? {
                ...previous,
                index:
                  (previous.index + delta + options.length) % options.length,
              }
            : previous,
        );
        return;
      }
      const selected = options[current.index] ?? options[0];
      selected.run(editor, current);
      setState(null);
    };
    editor.on("update", sync);
    editor.on("selectionUpdate", sync);
    editor.on("blur", sync);
    const dom = editor.view.dom;
    dom.addEventListener("keydown", keydown, true);
    return () => {
      editor.off("update", sync);
      editor.off("selectionUpdate", sync);
      editor.off("blur", sync);
      dom.removeEventListener("keydown", keydown, true);
    };
  }, [editor, shell]);

  if (!state || !editor.isEditable) return null;
  return (
    <div
      role="listbox"
      aria-label={t("common:documentEditor.insert")}
      className="kaneo-tiptap-slash-menu max-h-72 max-w-full overflow-y-auto"
      style={{ position: "absolute", top: state.top, left: state.left }}
    >
      {filtered.map((command, index) => (
        <button
          key={command.id}
          type="button"
          role="option"
          aria-selected={state.index === index}
          className={cn(
            "kaneo-tiptap-slash-item",
            state.index === index && "is-selected",
          )}
          onMouseEnter={() =>
            setState((current) => (current ? { ...current, index } : current))
          }
          onMouseDown={(event) => {
            event.preventDefault();
            run(command, state);
          }}
        >
          {command.label}
        </button>
      ))}
      {!filtered.length && (
        <div className="p-2 text-muted-foreground text-sm">
          {t("tasks:detail.editor.slash.empty")}
        </div>
      )}
    </div>
  );
}
