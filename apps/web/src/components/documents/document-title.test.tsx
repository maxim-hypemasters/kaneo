import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { DocumentTitle } from "./document-title";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
  initReactI18next: { type: "3rdParty", init: () => {} },
}));

const label = "tasks:features.workspace.documentTitle";

function renderTitle(props: Partial<Parameters<typeof DocumentTitle>[0]> = {}) {
  const handlers = {
    onChange: vi.fn(),
    onCommit: vi.fn(),
    onEnterBody: vi.fn(),
  };
  render(<DocumentTitle value="Design notes" {...handlers} {...props} />);
  return { ...handlers, title: screen.getByRole("textbox", { name: label }) };
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Feature document title", () => {
  it("keeps pasted titles on one line", () => {
    const { title, onChange } = renderTitle();
    fireEvent.change(title, { target: { value: "Design\r\n  notes" } });
    expect(onChange).toHaveBeenCalledWith("Design notes");
  });

  it("moves into the body on Enter, but not while composing", () => {
    const { title, onEnterBody } = renderTitle();
    fireEvent.keyDown(title, { key: "Enter", isComposing: true });
    expect(onEnterBody).not.toHaveBeenCalled();
    const enter = fireEvent.keyDown(title, { key: "Enter" });
    expect(onEnterBody).toHaveBeenCalledOnce();
    // Prevented, so no line break is typed.
    expect(enter).toBe(false);
  });

  it("moves into the body on ArrowDown only from the end", () => {
    const { title, onEnterBody } = renderTitle();
    (title as HTMLTextAreaElement).setSelectionRange(3, 3);
    fireEvent.keyDown(title, { key: "ArrowDown" });
    expect(onEnterBody).not.toHaveBeenCalled();
    (title as HTMLTextAreaElement).setSelectionRange(12, 12);
    fireEvent.keyDown(title, { key: "ArrowDown", shiftKey: true });
    expect(onEnterBody).not.toHaveBeenCalled();
    fireEvent.keyDown(title, { key: "ArrowDown" });
    expect(onEnterBody).toHaveBeenCalledOnce();
  });

  it("fits a long title when editing becomes allowed after the first render", () => {
    vi.spyOn(
      HTMLTextAreaElement.prototype,
      "scrollHeight",
      "get",
    ).mockReturnValue(96);
    const view = render(<DocumentTitle value="A long title" readOnly />);
    view.rerender(<DocumentTitle value="A long title" />);
    expect(screen.getByRole("textbox", { name: label })).toHaveStyle({
      height: "96px",
    });
  });

  it("commits on blur", () => {
    const { title, onCommit } = renderTitle();
    fireEvent.blur(title);
    expect(onCommit).toHaveBeenCalledOnce();
  });

  it("focuses and selects a new document's title", () => {
    const { title } = renderTitle({ focus: true });
    const field = title as HTMLTextAreaElement;
    expect(field).toHaveFocus();
    expect([field.selectionStart, field.selectionEnd]).toEqual([0, 12]);
  });

  it("is a heading for people who cannot edit", () => {
    render(<DocumentTitle value="Design notes" readOnly />);
    expect(
      screen.getByRole("heading", { level: 1, name: "Design notes" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });
});
