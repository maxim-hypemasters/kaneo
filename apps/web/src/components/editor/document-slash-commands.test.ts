import { Editor } from "@tiptap/core";
import type { TFunction } from "i18next";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { ResizableImage } from "@/components/task/extensions/resizable-image";
import { SHORTCUTS } from "@/lib/shortcuts/catalog";
import {
  type DocumentSlashCommand,
  documentSlashCommands,
  filterSlashCommands,
  groupSlashCommands,
} from "./document-slash-commands";
import { createEditorExtensions } from "./extensions";

const t = ((key: string) => key) as unknown as TFunction;
let editor: Editor | undefined;

afterEach(() => {
  editor?.destroy();
  editor = undefined;
});

function ids(commands: DocumentSlashCommand[]) {
  return commands.map((command) => command.id);
}

function createEditor(markdown: string) {
  editor = new Editor({
    content: markdown,
    contentType: "markdown",
    extensions: createEditorExtensions({
      placeholder: "",
      highlighter: () => null,
      resolveLanguage: (value) => value,
      image: ResizableImage,
    }),
  });
  return editor;
}

// The range of "/query" at the end of the first block.
function slashRange(active: Editor) {
  const block = active.state.doc.firstChild;
  const text = block?.textContent ?? "";
  const end = 1 + text.length;
  return { from: 1 + text.lastIndexOf("/"), to: end };
}

function actions() {
  return { upload: vi.fn(), link: vi.fn(), embed: vi.fn() };
}

describe("documentSlashCommands", () => {
  it("lists commands in menu order with icons and known shortcuts", () => {
    const commands = documentSlashCommands(t, true);
    expect(ids(commands)).toEqual([
      "paragraph",
      "heading-1",
      "heading-2",
      "heading-3",
      "blockquote",
      "bullet-list",
      "ordered-list",
      "task-list",
      "link",
      "table",
      "code-block",
      "image",
      "file",
      "embed",
    ]);
    expect(new Set(ids(commands)).size).toBe(commands.length);
    for (const command of commands) {
      expect(command.icon).toBeTruthy();
      expect(command.label).toMatch(/^common:documentEditor\./);
      if (command.shortcutId)
        expect(SHORTCUTS[command.shortcutId]).toBeDefined();
    }
  });

  it("offers Image and File only when uploads are allowed", () => {
    const commands = ids(documentSlashCommands(t, false));
    expect(commands).not.toContain("image");
    expect(commands).not.toContain("file");
    expect(commands.at(-1)).toBe("embed");
  });

  it("filters by label and by search terms", () => {
    const commands = documentSlashCommands(t, true);
    expect(ids(filterSlashCommands(commands, "HEADING2"))).toEqual([
      "heading-2",
    ]);
    expect(ids(filterSlashCommands(commands, "todo"))).toEqual(["task-list"]);
    expect(ids(filterSlashCommands(commands, "h3"))).toEqual(["heading-3"]);
    expect(ids(filterSlashCommands(commands, "youtube"))).toEqual(["embed"]);
    expect(filterSlashCommands(commands, "")).toBe(commands);
    expect(filterSlashCommands(commands, "nothing-matches")).toEqual([]);
  });

  it("groups commands with flat indexes in visual order", () => {
    const commands = documentSlashCommands(t, true);
    // Put the first list command first to prove the group order wins.
    const shuffled = [
      commands[5],
      ...commands.filter((_, index) => index !== 5),
    ];
    const groups = groupSlashCommands(shuffled);
    expect(groups.map((group) => group.group)).toEqual([
      "text",
      "lists",
      "insert",
    ]);
    expect(
      groups.flatMap((group) => group.items.map((item) => item.index)),
    ).toEqual(commands.map((_, index) => index));
    expect(
      groups.flatMap((group) => group.items.map((item) => item.command.id)),
    ).toEqual(ids(commands));
    expect(
      groupSlashCommands(filterSlashCommands(commands, "table")).map(
        (group) => group.group,
      ),
    ).toEqual(["insert"]);
  });

  it("keeps an H2 line an H2 when /h2 is typed on it", () => {
    const active = createEditor("## Plan /h2");
    const command = documentSlashCommands(t, false).find(
      (item) => item.id === "heading-2",
    );
    command?.run(active, slashRange(active), actions());
    expect(active.getJSON().content?.[0]).toMatchObject({
      type: "heading",
      attrs: { level: 2 },
    });
    expect(active.state.doc.textContent).toBe("Plan ");
  });

  it.each([
    ["link", "link", undefined],
    ["image", "upload", true],
    ["file", "upload", false],
    ["embed", "embed", undefined],
  ] as const)(
    "%s removes the typed command before calling its action",
    (id, action, argument) => {
      const active = createEditor(`Intro /${id}`);
      const handlers = actions();
      const seen: string[] = [];
      handlers[action].mockImplementation(() => {
        seen.push(active.state.doc.textContent);
      });
      const command = documentSlashCommands(t, true).find(
        (item) => item.id === id,
      );
      command?.run(active, slashRange(active), handlers);
      expect(seen).toEqual(["Intro "]);
      if (argument === undefined)
        expect(handlers[action]).toHaveBeenCalledWith();
      else expect(handlers[action]).toHaveBeenCalledWith(argument);
    },
  );

  it("inserts a table in place of the typed command", () => {
    const active = createEditor("/table");
    documentSlashCommands(t, false)
      .find((item) => item.id === "table")
      ?.run(active, slashRange(active), actions());
    expect(active.state.doc.textContent).not.toContain("/table");
    const types: string[] = [];
    active.state.doc.forEach((node) => {
      types.push(node.type.name);
    });
    expect(types).toContain("table");
  });
});
