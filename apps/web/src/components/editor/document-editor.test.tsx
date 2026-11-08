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
import { createRef, useState } from "react";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vite-plus/test";
import { DocumentEditor } from "./document-editor";
import type {
  DocumentEditorHandle,
  UploadedDocumentAsset,
} from "./document-editor-types";

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
    languages: new Set(["text", "typescript"]),
  }),
}));

function DraftEditor() {
  const [value, setValue] = useState("Original");
  return (
    <DocumentEditor
      ariaLabel="Description"
      value={value}
      onChange={setValue}
      footer={<button type="button">Save document</button>}
    />
  );
}

function ClickEditableDocument() {
  const [editing, setEditing] = useState(false);
  return (
    <DocumentEditor
      ariaLabel="Description"
      value="Original text"
      documentKey={editing ? "editing" : "reading"}
      readOnly={!editing}
      onRequestEdit={() => setEditing(true)}
    />
  );
}

async function getEditor() {
  await waitFor(() => expect(capture.editor).not.toBeNull());
  const editor = capture.editor;
  if (!editor) throw new Error("Missing document editor");
  return editor;
}

describe("DocumentEditor", () => {
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
  afterEach(cleanup);

  it("starts editing at the clicked text position", async () => {
    render(<ClickEditableDocument />);
    const editor = await getEditor();
    vi.spyOn(editor.view, "posAtCoords").mockReturnValue({ pos: 4, inside: 0 });

    fireEvent.click(editor.view.dom, { detail: 1, clientX: 20, clientY: 20 });

    await waitFor(() => expect(editor.isEditable).toBe(true));
    await waitFor(() => expect(document.activeElement).toBe(editor.view.dom));
    expect(editor.state.selection.from).toBe(4);
  });

  it("supports keyboard activation of a reading description", async () => {
    render(<ClickEditableDocument />);
    const editor = await getEditor();
    expect(editor.view.dom.getAttribute("tabindex")).toBe("0");
    fireEvent.keyDown(editor.view.dom, { key: "Enter" });
    await waitFor(() => expect(editor.isEditable).toBe(true));
  });

  it("keeps reading links and images independent of editing", async () => {
    const requestEdit = vi.fn();
    render(
      <DocumentEditor
        ariaLabel="Description"
        value="[Guide](https://example.com)\n\n![Preview](https://example.com/image.png)"
        readOnly
        onRequestEdit={requestEdit}
      />,
    );
    const editor = await getEditor();
    const stopNavigation = (event: Event) => event.preventDefault();
    document.addEventListener("click", stopNavigation);
    try {
      fireEvent.click(screen.getByRole("link", { name: "Guide" }));
    } finally {
      document.removeEventListener("click", stopNavigation);
    }
    fireEvent.click(editor.view.dom.querySelector("img")!);
    expect(await screen.findByRole("dialog")).toBeVisible();
    expect(requestEdit).not.toHaveBeenCalled();
    expect(editor.isEditable).toBe(false);
  });

  it("keeps one editor, selection, and undo history while expanding and returning", async () => {
    render(<DraftEditor />);
    const editor = await getEditor();
    const originalDom = editor.view.dom;
    act(() => {
      editor.chain().focus("end").insertContent(" draft").run();
    });
    const selected = editor.state.selection.from;
    fireEvent.click(
      screen.getByRole("button", { name: "common:documentEditor.expand" }),
    );
    const dialog = await screen.findByRole("dialog");
    await waitFor(() => expect(dialog.contains(originalDom)).toBe(true));
    expect(capture.editor).toBe(editor);
    expect(editor.state.selection.from).toBe(selected);
    expect(
      within(dialog).getByRole("button", { name: "Save document" }),
    ).toBeVisible();
    fireEvent.click(
      within(dialog).getByRole("button", {
        name: "common:documentEditor.collapse",
      }),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "common:documentEditor.expand" }),
      ).toHaveFocus(),
    );
    expect(capture.editor).toBe(editor);
    expect(originalDom.isConnected).toBe(true);
    expect(editor.getText()).toBe("Original draft");
    act(() => {
      editor.commands.undo();
    });
    expect(editor.getText()).toBe("Original");
  });

  it("places Expand directly after Undo and Redo inside the editing toolbar", async () => {
    render(<DraftEditor />);
    await getEditor();
    const toolbar = screen.getByRole("toolbar", {
      name: "common:documentEditor.toolbar",
    });
    const expand = within(toolbar).getByRole("button", {
      name: "common:documentEditor.expand",
    });
    const redo = within(toolbar).getByRole("button", {
      name: "common:documentEditor.redo",
    });
    expect(
      redo.compareDocumentPosition(expand) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      screen.getAllByRole("button", { name: "common:documentEditor.expand" }),
    ).toHaveLength(1);
  });

  it("keeps reading Expand inside the content without starting click-to-edit", async () => {
    const edit = vi.fn();
    render(
      <DocumentEditor
        ariaLabel="Page"
        value="Read this"
        readOnly
        onRequestEdit={edit}
      />,
    );
    const editor = await getEditor();
    const expand = screen.getByRole("button", {
      name: "common:documentEditor.expand",
    });
    expect(expand.closest(".kaneo-tiptap-shell")).toContainElement(
      editor.view.dom,
    );
    expect(screen.queryByRole("toolbar")).toBeNull();
    fireEvent.click(expand);
    expect(await screen.findByRole("dialog")).toBeVisible();
    expect(edit).not.toHaveBeenCalled();
  });

  it.each([false, true])(
    "disables the inline Expand control during writes (readOnly=%s)",
    async (readOnly) => {
      render(
        <DocumentEditor
          ariaLabel="Page"
          value="Text"
          readOnly={readOnly}
          disabled
        />,
      );
      await getEditor();
      const expand = screen.getByRole("button", {
        name: "common:documentEditor.expand",
      });
      if (readOnly) expect(expand).toBeDisabled();
      else expect(expand).toHaveAttribute("aria-disabled", "true");
      fireEvent.click(expand);
      expect(screen.queryByRole("dialog")).toBeNull();
    },
  );

  it("preserves bold Markdown pasted into a checklist and allows external draft resets", async () => {
    const change = vi.fn();
    const view = render(
      <DocumentEditor ariaLabel="Description" value="" onChange={change} />,
    );
    const editor = await getEditor();
    fireEvent.paste(editor.view.dom, {
      clipboardData: {
        files: [],
        getData: (type: string) =>
          type === "text/plain" ? "- [ ] **Check behavior**" : "",
      },
    });
    await waitFor(() => expect(change).toHaveBeenCalled());
    expect(change.mock.lastCall?.[0]).toContain("- [ ] **Check behavior**");
    expect(editor.view.dom.querySelector("strong")?.textContent).toBe(
      "Check behavior",
    );
    view.rerender(
      <DocumentEditor
        ariaLabel="Description"
        value="# Replacement"
        onChange={change}
      />,
    );
    expect(editor.view.dom.querySelector("h1")?.textContent).toBe(
      "Replacement",
    );
  });

  it("hides editing commands for read-only documents and keeps expansion available", async () => {
    render(
      <DocumentEditor
        ariaLabel="Description"
        value={
          '## Read this\n\n<kaneo-mention id="user-1" label="Client dev"></kaneo-mention>'
        }
        readOnly
      />,
    );
    const editor = await getEditor();
    expect(editor.isEditable).toBe(false);
    expect(screen.queryByRole("toolbar")).toBeNull();
    expect(
      screen.getByRole("button", { name: "common:documentEditor.expand" }),
    ).toBeEnabled();
    expect(editor.view.dom.querySelector("h2")?.textContent).toBe("Read this");
    expect(editor.view.dom.querySelector(".kaneo-mention")?.textContent).toBe(
      "@Client dev",
    );
  });

  it("does not offer upload commands without an injected upload capability", async () => {
    render(<DocumentEditor ariaLabel="Description" value="" />);
    await getEditor();
    fireEvent.click(
      screen.getByRole("button", { name: "common:documentEditor.insert" }),
    );
    const menu = await screen.findByRole("menu");
    expect(
      within(menu).queryByRole("menuitem", {
        name: "common:documentEditor.image",
      }),
    ).toBeNull();
    expect(
      within(menu).getByRole("menuitem", {
        name: "common:documentEditor.table",
      }),
    ).toBeVisible();
  });

  it("resets undo history when the document identity changes", async () => {
    const view = render(
      <DocumentEditor
        ariaLabel="Description"
        documentKey="first"
        value="First"
        onChange={vi.fn()}
      />,
    );
    const editor = await getEditor();
    act(() => {
      editor.chain().focus("end").insertContent(" changed").run();
    });
    view.rerender(
      <DocumentEditor
        ariaLabel="Description"
        documentKey="second"
        value="Second"
        onChange={vi.fn()}
      />,
    );
    act(() => {
      editor.commands.undo();
    });
    expect(editor.getText()).toBe("Second");
  });

  it("does not emit normalized Markdown when only the editing mode changes", async () => {
    const changed = vi.fn();
    const props = {
      ariaLabel: "Description",
      value: "[Client+UI] Message status",
      onChange: changed,
    };
    const view = render(<DocumentEditor {...props} readOnly />);
    const editor = await getEditor();
    view.rerender(<DocumentEditor {...props} />);
    view.rerender(<DocumentEditor {...props} disabled />);
    view.rerender(<DocumentEditor {...props} readOnly />);
    expect(editor.getText()).toBe(props.value);
    expect(changed).not.toHaveBeenCalled();
  });

  it("makes undo available through the compact overflow menu", async () => {
    render(
      <DocumentEditor
        ariaLabel="Description"
        value="Original"
        onChange={vi.fn()}
      />,
    );
    const editor = await getEditor();
    act(() => {
      editor.chain().focus("end").insertContent(" changed").run();
    });
    fireEvent.click(
      screen.getByRole("button", { name: "common:breadcrumb.more" }),
    );
    const menu = await screen.findByRole("menu");
    expect(
      within(menu).getByRole("menuitem", {
        name: "common:documentEditor.bulletedList",
      }),
    ).toBeVisible();
    fireEvent.click(
      within(menu).getByRole("menuitem", {
        name: "common:documentEditor.undo",
      }),
    );
    expect(editor.getText()).toBe("Original");
  });

  it("keeps an upload from changing the document after editing permission is lost", async () => {
    let finish: ((asset: UploadedDocumentAsset) => void) | undefined;
    const uploadAsset = vi.fn(
      () =>
        new Promise<UploadedDocumentAsset>((resolve) => {
          finish = resolve;
        }),
    );
    const pending = vi.fn();
    const changed = vi.fn();
    const view = render(
      <DocumentEditor
        ariaLabel="Description"
        value="Original"
        onChange={changed}
        uploadAsset={uploadAsset}
        onPendingUploadChange={pending}
      />,
    );
    const editor = await getEditor();
    fireEvent.change(screen.getByLabelText("common:documentEditor.file"), {
      target: {
        files: [new File(["image"], "draft.png", { type: "image/png" })],
      },
    });
    await waitFor(() => expect(uploadAsset).toHaveBeenCalled());
    expect(pending).toHaveBeenCalledWith(true);
    view.rerender(
      <DocumentEditor
        ariaLabel="Description"
        value="Original"
        readOnly
        onChange={changed}
        uploadAsset={uploadAsset}
        onPendingUploadChange={pending}
      />,
    );
    await act(async () => {
      finish?.({
        url: "https://example.com/draft.png",
        alt: "Draft",
        filename: "draft.png",
        mimeType: "image/png",
        size: 5,
        kind: "image",
      });
    });
    expect(editor.getText()).toBe("Original");
    expect(editor.view.dom.querySelector("img")).toBeNull();
    expect(changed).not.toHaveBeenCalled();
    expect(pending).toHaveBeenLastCalledWith(false);
  });
  it("updates checklist controls when entering editing or losing permission", async () => {
    const changed = vi.fn();
    const props = {
      ariaLabel: "Description",
      value: "- [ ] Check behavior",
      onChange: changed,
    };
    const view = render(<DocumentEditor {...props} readOnly />);
    await getEditor();
    const checkbox = await screen.findByRole("checkbox");
    expect(checkbox).toHaveAttribute("aria-disabled", "true");
    view.rerender(<DocumentEditor {...props} />);
    await waitFor(() =>
      expect(checkbox).not.toHaveAttribute("aria-disabled", "true"),
    );
    fireEvent.click(checkbox);
    await waitFor(() => expect(changed).toHaveBeenCalled());
    expect(changed.mock.lastCall?.[0]).toContain("- [x] Check behavior");
    view.rerender(<DocumentEditor {...props} readOnly />);
    await waitFor(() =>
      expect(checkbox).toHaveAttribute("aria-disabled", "true"),
    );
    const count = changed.mock.calls.length;
    fireEvent.click(checkbox);
    expect(changed).toHaveBeenCalledTimes(count);
  });

  describe("page variant", () => {
    function tail() {
      const element = document.querySelector(
        "[data-slot='document-editor-tail']",
      );
      if (!element) throw new Error("Missing page tail");
      return element;
    }

    it("has no toolbar, border box or Expand, and fills its container", async () => {
      const { container } = render(
        <DocumentEditor
          variant="page"
          ariaLabel="Document"
          value="Text"
          onChange={vi.fn()}
          expandable={false}
        />,
      );
      const editor = await getEditor();
      expect(screen.queryByRole("toolbar")).toBeNull();
      expect(
        screen.queryByRole("button", { name: "common:documentEditor.expand" }),
      ).toBeNull();
      const section = container.querySelector("section");
      expect(section).toHaveClass("flex-1");
      expect(container.querySelector(".rounded-xl")).toBeNull();
      const shell = editor.view.dom.closest(".kaneo-tiptap-shell");
      expect(shell).toHaveAttribute("data-variant", "page");
      expect(shell?.className).not.toContain("min-h-44");
      expect(shell).toContainElement(tail() as HTMLElement);
    });

    it("keeps the inline layout for other callers", async () => {
      const { container } = render(
        <DocumentEditor ariaLabel="Document" value="Text" onChange={vi.fn()} />,
      );
      const editor = await getEditor();
      const shell = editor.view.dom.closest(".kaneo-tiptap-shell");
      expect(shell).not.toHaveAttribute("data-variant");
      expect(shell?.className).toContain("min-h-44");
      expect(container.querySelector(".rounded-xl")).not.toBeNull();
      expect(
        document.querySelector("[data-slot='document-editor-tail']"),
      ).toBeNull();
    });

    it("moves the caret to the end when the space below the text is pressed", async () => {
      render(
        <DocumentEditor
          variant="page"
          ariaLabel="Document"
          value={"First\n\nLast"}
          onChange={vi.fn()}
        />,
      );
      const editor = await getEditor();
      const event = fireEvent.mouseDown(tail(), { button: 0 });
      expect(event).toBe(false);
      await waitFor(() => expect(document.activeElement).toBe(editor.view.dom));
      expect(editor.state.selection.from).toBe(
        editor.state.doc.content.size - 1,
      );
      expect(editor.state.doc.childCount).toBe(2);
    });

    it("adds a line to type on after a trailing code block", async () => {
      render(
        <DocumentEditor
          variant="page"
          ariaLabel="Document"
          value={"```ts\nconst a = 1;\n```"}
          onChange={vi.fn()}
        />,
      );
      const editor = await getEditor();
      fireEvent.mouseDown(tail(), { button: 0 });
      expect(editor.state.doc.lastChild?.type.name).toBe("paragraph");
      expect(editor.state.selection.$from.parent).toBe(
        editor.state.doc.lastChild,
      );
    });

    it("does not report the line added below a trailing block as an edit", async () => {
      const changed = vi.fn();
      render(
        <DocumentEditor
          variant="page"
          ariaLabel="Document"
          value="- item"
          onChange={changed}
        />,
      );
      const editor = await getEditor();
      fireEvent.mouseDown(tail(), { button: 0 });
      expect(editor.state.doc.lastChild?.type.name).toBe("paragraph");
      expect(changed).not.toHaveBeenCalled();
      // Typing on the new line is an edit.
      act(() => {
        editor.commands.insertContent("next");
      });
      expect(changed).toHaveBeenCalledOnce();
      expect(changed.mock.lastCall?.[0]).toContain("next");
    });

    it("ignores other buttons and read-only pages", async () => {
      const view = render(
        <DocumentEditor
          variant="page"
          ariaLabel="Document"
          value="Text"
          onChange={vi.fn()}
        />,
      );
      const editor = await getEditor();
      expect(fireEvent.mouseDown(tail(), { button: 2 })).toBe(true);
      view.rerender(
        <DocumentEditor
          variant="page"
          ariaLabel="Document"
          value="Text"
          readOnly
          placeholder="Nothing here"
        />,
      );
      expect(fireEvent.mouseDown(tail(), { button: 0 })).toBe(true);
      expect(tail()).not.toHaveClass("cursor-text");
      expect(document.activeElement).not.toBe(editor.view.dom);
    });

    it("puts the hint on the focused empty paragraph only", async () => {
      render(
        <DocumentEditor
          variant="page"
          ariaLabel="Document"
          value="Intro"
          placeholder="Type / for commands"
          onChange={vi.fn()}
        />,
      );
      const editor = await getEditor();
      act(() => {
        editor.chain().focus("end").splitBlock().run();
      });
      const empty = editor.view.dom.querySelector("p.is-empty");
      expect(empty).toHaveAttribute("data-placeholder", "Type / for commands");
      expect(empty?.parentElement).toBe(editor.view.dom);
      act(() => {
        editor.commands.setHeading({ level: 2 });
      });
      expect(editor.view.dom.querySelector("h2.is-empty")).toHaveAttribute(
        "data-placeholder",
        "",
      );
    });

    it("focuses through its ref handle while editable", async () => {
      const ref = createRef<DocumentEditorHandle>();
      const view = render(
        <DocumentEditor
          ref={ref}
          variant="page"
          ariaLabel="Document"
          value="Hello"
          onChange={vi.fn()}
        />,
      );
      const editor = await getEditor();
      act(() => ref.current?.focus("start"));
      // Synchronous, so keys typed straight after Enter in a title land here.
      expect(document.activeElement).toBe(editor.view.dom);
      expect(editor.state.selection.from).toBe(1);

      act(() => {
        editor.view.dom.blur();
      });
      view.rerender(
        <DocumentEditor
          ref={ref}
          variant="page"
          ariaLabel="Document"
          value="Hello"
          readOnly
        />,
      );
      act(() => ref.current?.focus("end"));
      await new Promise((resolve) => requestAnimationFrame(resolve));
      expect(document.activeElement).not.toBe(editor.view.dom);
    });
  });

  it.each(["javascript:alert(1)", "data:text/html,<script>alert(1)</script>"])(
    "rejects unsafe link %s at an empty selection",
    async (value) => {
      render(
        <DocumentEditor ariaLabel="Description" value="" onChange={vi.fn()} />,
      );
      const editor = await getEditor();
      fireEvent.click(
        screen.getByRole("button", { name: "common:documentEditor.link" }),
      );
      const input = await screen.findByRole("textbox", {
        name: "common:editor.link.label",
      });
      fireEvent.change(input, { target: { value } });
      fireEvent.click(
        screen.getByRole("button", { name: "common:editor.link.apply" }),
      );
      expect(await screen.findByRole("alert")).toHaveTextContent(
        "tasks:detail.editor.embed.errors.invalidUrl",
      );
      expect(editor.getText()).toBe("");
      fireEvent.change(input, { target: { value: "https://example.com" } });
      fireEvent.click(
        screen.getByRole("button", { name: "common:editor.link.apply" }),
      );
      await waitFor(() =>
        expect(editor.view.dom.querySelector("a")?.getAttribute("href")).toBe(
          "https://example.com",
        ),
      );
    },
  );
});
