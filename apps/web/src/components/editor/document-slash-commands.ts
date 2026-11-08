import type { Editor } from "@tiptap/core";
import type { TFunction } from "i18next";
import {
  Code,
  Columns3,
  FileUp,
  Heading1,
  Heading2,
  Heading3,
  Image,
  Link2,
  List,
  ListOrdered,
  ListTodo,
  type LucideIcon,
  Quote,
  Type,
  Video,
} from "lucide-react";
import type { ShortcutId } from "@/lib/shortcuts/catalog";
import type { SlashRange } from "./slash-commands";

export type DocumentSlashGroup = "text" | "lists" | "insert";

export type DocumentSlashActions = {
  upload: (imagesOnly: boolean) => void;
  link: () => void;
  embed: () => void;
};

export type DocumentSlashCommand = {
  id: string;
  group: DocumentSlashGroup;
  label: string;
  search: string;
  icon: LucideIcon;
  shortcutId?: ShortcutId;
  run: (
    editor: Editor,
    range: SlashRange,
    actions: DocumentSlashActions,
  ) => void;
};

export type DocumentSlashCommandGroup = {
  group: DocumentSlashGroup;
  items: { command: DocumentSlashCommand; index: number }[];
};

const groupOrder: DocumentSlashGroup[] = ["text", "lists", "insert"];

function clear(editor: Editor, range: SlashRange) {
  return editor.chain().focus().deleteRange(range);
}

function heading(
  level: 1 | 2 | 3,
  label: string,
  icon: LucideIcon,
  shortcutId: ShortcutId,
): DocumentSlashCommand {
  return {
    id: `heading-${level}`,
    group: "text",
    label,
    search: `heading title h${level}`,
    icon,
    shortcutId,
    // setHeading, not toggle: "/h2" typed on an H2 line keeps it an H2.
    run: (editor, range) => {
      clear(editor, range).setHeading({ level }).run();
    },
  };
}

export function documentSlashCommands(
  t: TFunction,
  canUpload: boolean,
): DocumentSlashCommand[] {
  const commands: DocumentSlashCommand[] = [
    {
      id: "paragraph",
      group: "text",
      label: t("common:documentEditor.paragraph"),
      search: "text paragraph normal",
      icon: Type,
      shortcutId: "editorParagraph",
      run: (editor, range) => {
        clear(editor, range).setParagraph().run();
      },
    },
    heading(1, t("common:documentEditor.heading1"), Heading1, "editorHeading1"),
    heading(2, t("common:documentEditor.heading2"), Heading2, "editorHeading2"),
    heading(3, t("common:documentEditor.heading3"), Heading3, "editorHeading3"),
    {
      id: "blockquote",
      group: "text",
      label: t("common:documentEditor.quote"),
      search: "quote blockquote",
      icon: Quote,
      shortcutId: "editorQuote",
      run: (editor, range) => {
        clear(editor, range).toggleBlockquote().run();
      },
    },
    {
      id: "bullet-list",
      group: "lists",
      label: t("common:documentEditor.bulletedList"),
      search: "list bullet unordered",
      icon: List,
      shortcutId: "editorBulletList",
      run: (editor, range) => {
        clear(editor, range).toggleBulletList().run();
      },
    },
    {
      id: "ordered-list",
      group: "lists",
      label: t("common:documentEditor.numberedList"),
      search: "list ordered numbered",
      icon: ListOrdered,
      shortcutId: "editorNumberedList",
      run: (editor, range) => {
        clear(editor, range).toggleOrderedList().run();
      },
    },
    {
      id: "task-list",
      group: "lists",
      label: t("common:documentEditor.checklist"),
      search: "todo to-do checklist checkbox task list",
      icon: ListTodo,
      shortcutId: "editorChecklist",
      run: (editor, range) => {
        clear(editor, range).toggleTaskList().run();
      },
    },
    {
      id: "link",
      group: "insert",
      label: t("common:documentEditor.link"),
      search: "link url href",
      icon: Link2,
      shortcutId: "editorLink",
      run: (editor, range, actions) => {
        clear(editor, range).run();
        actions.link();
      },
    },
    {
      id: "table",
      group: "insert",
      label: t("common:documentEditor.table"),
      search: "table grid",
      icon: Columns3,
      run: (editor, range) => {
        clear(editor, range)
          .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
          .run();
      },
    },
    {
      id: "code-block",
      group: "insert",
      label: t("common:documentEditor.codeBlock"),
      search: "code snippet",
      icon: Code,
      shortcutId: "editorCodeBlock",
      run: (editor, range) => {
        clear(editor, range).toggleCodeBlock().run();
      },
    },
  ];
  if (canUpload)
    commands.push(
      {
        id: "image",
        group: "insert",
        label: t("common:documentEditor.image"),
        search: "image picture photo upload",
        icon: Image,
        run: (editor, range, actions) => {
          clear(editor, range).run();
          actions.upload(true);
        },
      },
      {
        id: "file",
        group: "insert",
        label: t("common:documentEditor.file"),
        search: "file upload attachment",
        icon: FileUp,
        shortcutId: "editorAttach",
        run: (editor, range, actions) => {
          clear(editor, range).run();
          actions.upload(false);
        },
      },
    );
  commands.push({
    id: "embed",
    group: "insert",
    label: t("common:documentEditor.embed"),
    search: "embed youtube video",
    icon: Video,
    run: (editor, range, actions) => {
      clear(editor, range).run();
      actions.embed();
    },
  });
  return commands;
}

export function filterSlashCommands(
  commands: DocumentSlashCommand[],
  query: string,
) {
  const needle = query.toLowerCase();
  if (!needle) return commands;
  return commands.filter(
    (command) =>
      command.label.toLowerCase().includes(needle) ||
      command.search.includes(needle),
  );
}

// Indexes run across groups in the order they are shown, so arrow keys move
// through the menu the way it reads.
export function groupSlashCommands(
  commands: DocumentSlashCommand[],
): DocumentSlashCommandGroup[] {
  let index = 0;
  return groupOrder.flatMap((group) => {
    const items = commands
      .filter((command) => command.group === group)
      .map((command) => ({ command, index: index++ }));
    return items.length ? [{ group, items }] : [];
  });
}
