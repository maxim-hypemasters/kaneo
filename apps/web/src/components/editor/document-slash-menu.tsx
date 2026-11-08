import type { Editor } from "@tiptap/core";
import {
  type RefObject,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { ShortcutKeys } from "@/components/shortcuts/shortcut-keys";
import { cn } from "@/lib/cn";
import {
  type DocumentSlashActions,
  type DocumentSlashCommand,
  documentSlashCommands,
  filterSlashCommands,
  groupSlashCommands,
} from "./document-slash-commands";
import type { SlashRange } from "./slash-commands";
import { placeSlashMenu } from "./slash-menu-placement";
import { visibleBounds } from "./visible-bounds";

type SlashState = SlashRange & { query: string; index: number };

const slashPattern = /(?:^|\s)\/([^\s/]*)$/;
const menuKeys = new Set(["ArrowDown", "ArrowUp", "Enter", "Tab"]);

export function DocumentSlashMenu({
  editor,
  shell,
  canUpload,
  onUpload,
  onLink,
  onEmbed,
}: {
  editor: Editor;
  shell: RefObject<HTMLDivElement | null>;
  canUpload: boolean;
  onUpload: (imagesOnly: boolean) => void;
  onLink: () => void;
  onEmbed: () => void;
}) {
  const { t } = useTranslation();
  const listboxId = useId();
  const menu = useRef<HTMLDivElement>(null);
  // Escape closes the menu for the rest of that slash, even as typing goes on.
  const dismissedFrom = useRef<number | null>(null);
  const [state, setState] = useState<SlashState | null>(null);
  const commands = useMemo(
    () => documentSlashCommands(t, canUpload),
    [t, canUpload],
  );
  const groups = groupSlashCommands(
    filterSlashCommands(commands, state?.query ?? ""),
  );
  const options = groups.flatMap((group) =>
    group.items.map((item) => item.command),
  );
  const selected = state ? Math.min(state.index, options.length - 1) : -1;
  const optionId = (command: DocumentSlashCommand) =>
    `${listboxId}-${command.id}`;
  const activeId = selected >= 0 ? optionId(options[selected]) : undefined;
  const actions: DocumentSlashActions = {
    upload: onUpload,
    link: onLink,
    embed: onEmbed,
  };
  const titles = {
    text: t("tasks:detail.editor.slash.groups.text"),
    lists: t("tasks:detail.editor.slash.groups.lists"),
    insert: t("tasks:detail.editor.slash.groups.insert"),
  };
  const latest = useRef({ state, options, actions });
  useLayoutEffect(() => {
    latest.current = { state, options, actions };
  });

  const run = (command: DocumentSlashCommand) => {
    if (!state || !editor.isEditable) return;
    command.run(editor, state, actions);
    setState(null);
  };

  useEffect(() => {
    const sync = () => {
      const { selection } = editor.state;
      const { $from } = selection;
      const match =
        editor.isEditable &&
        selection.empty &&
        $from.parent.type.name !== "codeBlock"
          ? slashPattern.exec(
              $from.parent.textBetween(0, $from.parentOffset, "\n", "\0"),
            )
          : null;
      if (!match) {
        dismissedFrom.current = null;
        setState(null);
        return;
      }
      const query = match[1] ?? "";
      const from = $from.pos - query.length - 1;
      if (!editor.isFocused || dismissedFrom.current === from) {
        setState(null);
        return;
      }
      setState((previous) => ({
        from,
        to: $from.pos,
        query,
        index:
          previous?.from === from && previous.query === query
            ? previous.index
            : 0,
      }));
    };
    // Capture phase on the editor, so Escape never reaches an enclosing dialog
    // and Enter never reaches ProseMirror while the menu handles them.
    const keydown = (event: KeyboardEvent) => {
      const {
        state: current,
        options: available,
        actions: handlers,
      } = latest.current;
      if (!current || !editor.isEditable || event.isComposing) return;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        dismissedFrom.current = current.from;
        setState(null);
        return;
      }
      if (!available.length || !menuKeys.has(event.key)) return;
      event.preventDefault();
      event.stopPropagation();
      const count = available.length;
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        const delta = event.key === "ArrowDown" ? 1 : -1;
        setState((previous) =>
          previous
            ? {
                ...previous,
                index:
                  (Math.min(previous.index, count - 1) + delta + count) % count,
              }
            : previous,
        );
        return;
      }
      available[Math.min(current.index, count - 1)].run(
        editor,
        current,
        handlers,
      );
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
  }, [editor]);

  const open = state !== null;
  useLayoutEffect(() => {
    if (!open) return;
    const dom = editor.view.dom;
    dom.setAttribute("aria-controls", listboxId);
    dom.setAttribute("aria-autocomplete", "list");
    if (activeId) dom.setAttribute("aria-activedescendant", activeId);
    return () => {
      dom.removeAttribute("aria-controls");
      dom.removeAttribute("aria-autocomplete");
      dom.removeAttribute("aria-activedescendant");
    };
  }, [editor, open, listboxId, activeId]);

  useLayoutEffect(() => {
    const element = menu.current;
    const container = shell.current;
    if (!state || !element || !container) return;
    const viewport = window.visualViewport;
    const placement = placeSlashMenu({
      anchor: editor.view.coordsAtPos(state.from),
      origin: container.getBoundingClientRect(),
      // The menu sits inside the page's scroller, which cuts it off at its
      // own edges (below the header), not only at the screen's.
      viewport: visibleBounds(
        container,
        viewport
          ? { top: viewport.offsetTop, height: viewport.height }
          : { top: 0, height: window.innerHeight },
      ),
      menu: { width: element.offsetWidth, height: element.scrollHeight },
    });
    element.style.top = `${placement.top}px`;
    element.style.left = `${placement.left}px`;
    element.style.maxHeight = `${placement.maxHeight}px`;
    const option = activeId ? document.getElementById(activeId) : null;
    if (!option) return;
    const top = option.offsetTop;
    const bottom = top + option.offsetHeight;
    if (top < element.scrollTop) element.scrollTop = top;
    else if (bottom > element.scrollTop + element.clientHeight)
      element.scrollTop = bottom - element.clientHeight;
  }, [editor, shell, state, activeId, options.length]);

  if (!state || !editor.isEditable) return null;
  return (
    <div
      ref={menu}
      id={listboxId}
      role="listbox"
      aria-label={t("common:documentEditor.insert")}
      className="kaneo-tiptap-slash-menu absolute w-72 max-w-[calc(100vw-1rem)] overflow-y-auto overscroll-contain"
    >
      {groups.map((group) => (
        <div
          key={group.group}
          role="group"
          aria-labelledby={`${listboxId}-group-${group.group}`}
          className="kaneo-tiptap-slash-group"
        >
          <div
            id={`${listboxId}-group-${group.group}`}
            className="kaneo-tiptap-slash-group-title"
          >
            {titles[group.group]}
          </div>
          {group.items.map(({ command, index }) => (
            <button
              key={command.id}
              id={optionId(command)}
              type="button"
              role="option"
              tabIndex={-1}
              aria-selected={index === selected}
              className={cn(
                "kaneo-tiptap-slash-item",
                index === selected && "is-selected",
              )}
              onMouseMove={() => {
                if (index !== selected)
                  setState((current) =>
                    current ? { ...current, index } : current,
                  );
              }}
              onMouseDown={(event) => {
                // Keep focus (and the caret) in the editor.
                event.preventDefault();
                if (event.button === 0) run(command);
              }}
            >
              <span className="flex min-w-0 items-center gap-2">
                <command.icon
                  aria-hidden
                  className="size-4 shrink-0 text-muted-foreground"
                />
                <span className="kaneo-tiptap-slash-label">
                  {command.label}
                </span>
              </span>
              {command.shortcutId && (
                <span className="kaneo-tiptap-slash-shortcut">
                  <ShortcutKeys id={command.shortcutId} tone="muted" />
                </span>
              )}
            </button>
          ))}
        </div>
      ))}
      {!options.length && (
        <div className="kaneo-tiptap-slash-empty">
          {t("tasks:detail.editor.slash.empty")}
        </div>
      )}
    </div>
  );
}
