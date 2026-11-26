import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import type { Editor } from "@tiptap/core";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vite-plus/test";
import type { MentionMember } from "@/components/task/extensions/mention-list";
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

const members: MentionMember[] = [
  { id: "ada", label: "Ada Lovelace" },
  { id: "bo", label: "Bo Diddley" },
];
const ADA = '<kaneo-mention id="ada" label="Ada Lovelace"></kaneo-mention>';

async function getEditor() {
  await waitFor(() => expect(capture.editor).not.toBeNull());
  const editor = capture.editor;
  if (!editor) throw new Error("Missing document editor");
  return editor;
}

async function typeAtEnd(text: string) {
  const editor = await getEditor();
  act(() => {
    editor.chain().focus("end").insertContent(text).run();
  });
  return editor;
}

const popup = () => document.querySelector(".kaneo-mention-popup");

describe("DocumentEditor mentions", () => {
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
    for (const element of document.querySelectorAll(".kaneo-mention-popup"))
      element.remove();
  });

  it("lists the members matching what follows @ and inserts the one picked", async () => {
    const onChange = vi.fn();
    render(
      <DocumentEditor
        ariaLabel="Description"
        value=""
        onChange={onChange}
        mentionMembers={members}
      />,
    );
    const editor = await typeAtEnd("@ad");
    expect(
      await screen.findByRole("button", { name: /Ada Lovelace/ }),
    ).toBeVisible();
    expect(screen.queryByRole("button", { name: /Bo Diddley/ })).toBeNull();

    fireEvent.keyDown(editor.view.dom, { key: "Enter" });

    await waitFor(() =>
      expect(onChange).toHaveBeenLastCalledWith(expect.stringContaining(ADA)),
    );
    expect(popup()).toBeNull();
  });

  it("picks the member with Enter inside a checklist item instead of splitting it", async () => {
    const onChange = vi.fn();
    render(
      <DocumentEditor
        ariaLabel="Description"
        value="- [ ] First"
        onChange={onChange}
        mentionMembers={members}
      />,
    );
    const editor = await typeAtEnd(" @ad");
    await screen.findByRole("button", { name: /Ada Lovelace/ });

    fireEvent.keyDown(editor.view.dom, { key: "Enter" });

    await waitFor(() =>
      expect(onChange).toHaveBeenLastCalledWith(expect.stringContaining(ADA)),
    );
    const markdown = onChange.mock.lastCall?.[0] as string;
    expect(markdown.match(/^- \[ \]/gm)).toHaveLength(1);
  });

  it("closes the list on Escape without letting the key reach the page", async () => {
    render(
      <DocumentEditor
        ariaLabel="Description"
        value=""
        onChange={() => {}}
        mentionMembers={members}
      />,
    );
    const editor = await typeAtEnd("@");
    await screen.findByRole("button", { name: /Ada Lovelace/ });
    const outer = vi.fn();
    window.addEventListener("keydown", outer);

    fireEvent.keyDown(editor.view.dom, { key: "Escape" });

    window.removeEventListener("keydown", outer);
    expect(outer).not.toHaveBeenCalled();
    await waitFor(() => expect(popup()).toBeNull());
  });

  it("offers no list where no members are given", async () => {
    render(
      <DocumentEditor ariaLabel="Description" value="" onChange={() => {}} />,
    );
    await typeAtEnd("@ad");
    expect(popup()).toBeNull();
    expect(screen.queryByRole("button", { name: /Ada Lovelace/ })).toBeNull();
  });
});
