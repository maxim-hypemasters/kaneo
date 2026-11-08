import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import type { Editor } from "@tiptap/core";
import type { ComponentProps } from "react";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vite-plus/test";
import { Dialog, DialogPopup, DialogTitle } from "@/components/ui/dialog";
import { DocumentEditor } from "./document-editor";

const capture = vi.hoisted(() => ({ editor: null as Editor | null }));

vi.mock("@tiptap/react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tiptap/react")>();
  return {
    ...actual,
    useEditor: (...args: Parameters<typeof actual.useEditor>) => {
      const editor = actual.useEditor(...args);
      capture.editor = editor;
      return editor;
    },
  };
});
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
  initReactI18next: { type: "3rdParty", init: () => {} },
}));
vi.mock("./use-editor-highlighter", () => ({
  useEditorHighlighter: () => ({
    highlighter: null,
    highlighterRef: { current: null },
    languages: new Set(["text"]),
  }),
}));

type EditorProps = Partial<ComponentProps<typeof DocumentEditor>>;

function renderEditor(props: EditorProps = {}) {
  return render(
    <DocumentEditor
      ariaLabel="Document"
      value=""
      onChange={vi.fn()}
      {...props}
    />,
  );
}

async function getEditor() {
  await waitFor(() => expect(capture.editor).not.toBeNull());
  const editor = capture.editor;
  if (!editor) throw new Error("Missing document editor");
  return editor;
}

async function type(editor: Editor, text: string) {
  act(() => {
    editor.view.focus();
    editor.commands.insertContent(text);
  });
}

function menu() {
  return screen.queryByRole("listbox", {
    name: "common:documentEditor.insert",
  });
}

async function openMenu(editor: Editor, text = "/") {
  await type(editor, text);
  return screen.findByRole("listbox", { name: "common:documentEditor.insert" });
}

function option(name: string) {
  return screen.getByRole("option", { name: new RegExp(name) });
}

function selectedOption() {
  return screen
    .getAllByRole("option")
    .find((item) => item.getAttribute("aria-selected") === "true");
}

describe("DocumentSlashMenu", () => {
  beforeEach(() => {
    capture.editor = null;
    Object.defineProperty(Range.prototype, "getClientRects", {
      configurable: true,
      value: () => [],
    });
    Object.defineProperty(Range.prototype, "getBoundingClientRect", {
      configurable: true,
      value: () => new DOMRect(),
    });
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("shows grouped commands with icons and shortcut keys", async () => {
    renderEditor({ uploadAsset: vi.fn() });
    const editor = await getEditor();
    const listbox = await openMenu(editor);

    expect(within(listbox).getAllByRole("group")).toHaveLength(3);
    expect(
      within(listbox).getByRole("group", {
        name: "tasks:detail.editor.slash.groups.text",
      }),
    ).toContainElement(option("common:documentEditor.heading1"));
    expect(
      within(listbox).getByRole("group", {
        name: "tasks:detail.editor.slash.groups.lists",
      }),
    ).toContainElement(option("common:documentEditor.checklist"));
    expect(
      within(listbox).getByRole("group", {
        name: "tasks:detail.editor.slash.groups.insert",
      }),
    ).toContainElement(option("common:documentEditor.image"));
    expect(within(listbox).getAllByRole("option")).toHaveLength(14);
    const heading = option("common:documentEditor.heading1");
    expect(heading.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    expect(heading.querySelectorAll("kbd").length).toBeGreaterThan(0);
    expect(
      option("common:documentEditor.table").querySelector("kbd"),
    ).toBeNull();
  });

  it("flips within the page's scroller, not under the header above it", async () => {
    const height = Object.getOwnPropertyDescriptor(window, "innerHeight");
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      value: 500,
    });
    try {
      const scroller = document.createElement("div");
      scroller.style.overflowY = "auto";
      // The scroller starts below a 49px header.
      scroller.getBoundingClientRect = () => new DOMRect(0, 49, 800, 451);
      document.body.append(scroller);
      vi.spyOn(Element.prototype, "scrollHeight", "get").mockReturnValue(400);
      render(
        <DocumentEditor ariaLabel="Document" value="" onChange={vi.fn()} />,
        { container: scroller },
      );
      const editor = await getEditor();
      vi.spyOn(editor.view, "coordsAtPos").mockReturnValue({
        top: 300,
        bottom: 320,
        left: 50,
        right: 50,
      });
      const listbox = await openMenu(editor);
      // 239px fit between the header and the caret, so the menu's top edge
      // stays at 57px, inside the scroller.
      expect(listbox.style.maxHeight).toBe("239px");
      expect(listbox.style.top).toBe("57px");
    } finally {
      if (height) Object.defineProperty(window, "innerHeight", height);
    }
  });

  it("moves the selection with the arrow keys and mirrors it on the editor", async () => {
    renderEditor();
    const editor = await getEditor();
    const listbox = await openMenu(editor);
    const dom = editor.view.dom;
    const options = within(listbox).getAllByRole("option");

    expect(selectedOption()).toBe(options[0]);
    expect(dom).toHaveAttribute("aria-controls", listbox.id);
    expect(dom).toHaveAttribute("aria-autocomplete", "list");
    expect(dom).toHaveAttribute("aria-activedescendant", options[0].id);

    fireEvent.keyDown(dom, { key: "ArrowDown" });
    expect(selectedOption()).toBe(options[1]);
    expect(dom).toHaveAttribute("aria-activedescendant", options[1].id);

    fireEvent.keyDown(dom, { key: "ArrowUp" });
    fireEvent.keyDown(dom, { key: "ArrowUp" });
    expect(selectedOption()).toBe(options.at(-1));
    expect(dom).toHaveAttribute("aria-activedescendant", options.at(-1)?.id);
  });

  it("runs the selected command on Enter without splitting the line", async () => {
    renderEditor();
    const editor = await getEditor();
    await openMenu(editor, "/h2");
    expect(screen.getAllByRole("option")).toHaveLength(1);

    fireEvent.keyDown(editor.view.dom, { key: "Enter" });

    expect(menu()).toBeNull();
    expect(editor.state.doc.childCount).toBe(1);
    expect(editor.getJSON().content?.[0]).toMatchObject({
      type: "heading",
      attrs: { level: 2 },
    });
    expect(editor.getText()).toBe("");
    expect(editor.view.dom).not.toHaveAttribute("aria-controls");
    expect(editor.view.dom).not.toHaveAttribute("aria-autocomplete");
    expect(editor.view.dom).not.toHaveAttribute("aria-activedescendant");
  });

  it("runs a clicked command and keeps focus in the editor", async () => {
    renderEditor();
    const editor = await getEditor();
    await openMenu(editor, "Intro /");

    const quote = option("common:documentEditor.quote");
    const event = fireEvent.mouseDown(quote);

    expect(event).toBe(false);
    expect(menu()).toBeNull();
    expect(editor.getJSON().content?.[0]?.type).toBe("blockquote");
    expect(editor.state.doc.textContent).toBe("Intro ");
    expect(document.activeElement).toBe(editor.view.dom);
  });

  it("opens the link dialog and the images-only picker", async () => {
    const click = vi
      .spyOn(HTMLInputElement.prototype, "click")
      .mockImplementation(() => {});
    renderEditor({ uploadAsset: vi.fn() });
    const editor = await getEditor();
    await openMenu(editor, "/image");
    fireEvent.keyDown(editor.view.dom, { key: "Enter" });
    const input = screen.getByLabelText<HTMLInputElement>(
      "common:documentEditor.file",
    );
    expect(click).toHaveBeenCalledTimes(1);
    expect(input.accept).toBe("image/*");
    expect(editor.getText()).toBe("");

    await openMenu(editor, "/link");
    fireEvent.mouseDown(option("common:documentEditor.link"));
    expect(
      await screen.findByRole("textbox", { name: "common:editor.link.label" }),
    ).toBeVisible();
    expect(editor.getText()).toBe("");
  });

  it("lets Enter and arrows reach the editor when nothing matches", async () => {
    renderEditor();
    const editor = await getEditor();
    const listbox = await openMenu(editor, "/zzz");
    expect(within(listbox).queryAllByRole("option")).toHaveLength(0);
    expect(listbox).toHaveTextContent("tasks:detail.editor.slash.empty");
    expect(editor.view.dom).not.toHaveAttribute("aria-activedescendant");

    fireEvent.keyDown(editor.view.dom, { key: "Enter" });

    expect(editor.state.doc.childCount).toBe(2);
    expect(menu()).toBeNull();
  });

  it("closes on Escape inside a dialog without closing the dialog", async () => {
    const openChange = vi.fn();
    render(
      <Dialog open onOpenChange={openChange}>
        <DialogPopup showCloseButton={false}>
          <DialogTitle>Document</DialogTitle>
          <DocumentEditor ariaLabel="Document" value="" onChange={vi.fn()} />
        </DialogPopup>
      </Dialog>,
    );
    await screen.findByRole("dialog");
    const editor = await getEditor();
    await openMenu(editor);

    fireEvent.keyDown(editor.view.dom, { key: "Escape" });

    expect(menu()).toBeNull();
    expect(openChange).not.toHaveBeenCalled();
    expect(editor.view.dom).not.toHaveAttribute("aria-controls");

    // The same slash stays dismissed while typing continues.
    await type(editor, "h");
    expect(menu()).toBeNull();

    // With the menu gone, Escape belongs to the dialog again.
    fireEvent.keyDown(editor.view.dom, { key: "Escape" });
    expect(openChange).toHaveBeenCalledWith(false, expect.anything());
  });

  it("opens again for a new slash after a dismissal", async () => {
    renderEditor();
    const editor = await getEditor();
    await openMenu(editor);
    fireEvent.keyDown(editor.view.dom, { key: "Escape" });
    expect(menu()).toBeNull();

    await type(editor, " ");
    await openMenu(editor, "/");
    expect(menu()).not.toBeNull();
  });

  it("removes its attributes from the editor when editing stops", async () => {
    const view = renderEditor();
    const editor = await getEditor();
    await openMenu(editor);
    expect(editor.view.dom).toHaveAttribute("aria-controls");

    view.rerender(
      <DocumentEditor
        ariaLabel="Document"
        value="/"
        onChange={vi.fn()}
        readOnly
      />,
    );

    expect(menu()).toBeNull();
    expect(editor.view.dom).not.toHaveAttribute("aria-controls");
    expect(editor.view.dom).not.toHaveAttribute("aria-autocomplete");
    expect(editor.view.dom).not.toHaveAttribute("aria-activedescendant");
  });
});
