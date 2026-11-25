import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { CommentComposer } from "./comment-composer";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("@/components/editor/document-draft-guard", () => ({
  useDocumentDraftGuard: () => {},
}));

afterEach(() => {
  cleanup();
  for (const popup of document.querySelectorAll(".kaneo-mention-popup"))
    popup.remove();
});

function setup(props: Partial<Parameters<typeof CommentComposer>[0]> = {}) {
  const onSubmit = vi.fn().mockResolvedValue(undefined);
  const onCancel = vi.fn();
  render(
    <CommentComposer
      placeholder="Add a comment…"
      submitLabel="Comment"
      failedMessage="Could not post"
      members={[]}
      onSubmit={onSubmit}
      onCancel={onCancel}
      {...props}
    />,
  );
  return { onSubmit, onCancel };
}

const field = () => screen.findByRole("textbox", { name: "Add a comment…" });
const submit = () => screen.getByRole("button", { name: "Comment" });

describe("CommentComposer", () => {
  it("has nothing to post while it is empty", async () => {
    setup();
    await field();
    expect(submit()).toBeDisabled();
  });

  it("posts the comment as Markdown and clears the field", async () => {
    const { onSubmit } = setup({ initialContent: "Too **tight**?" });
    const editor = await field();
    fireEvent.click(submit());
    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledExactlyOnceWith("Too **tight**?"),
    );
    await waitFor(() => expect(editor.textContent).toBe(""));
    expect(submit()).toBeDisabled();
  });

  it("keeps the text and says so when posting fails", async () => {
    setup({
      initialContent: "Keep me",
      onSubmit: vi.fn().mockRejectedValue(new Error("offline")),
    });
    const editor = await field();
    fireEvent.click(submit());
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Could not post",
    );
    expect(editor.textContent).toBe("Keep me");
    expect(submit()).toBeEnabled();
  });

  it("cancels on Escape without letting the key reach the document", async () => {
    const { onCancel } = setup({ initialContent: "Draft" });
    const outer = vi.fn();
    window.addEventListener("keydown", outer);
    fireEvent.keyDown(await field(), { key: "Escape" });
    window.removeEventListener("keydown", outer);
    expect(onCancel).toHaveBeenCalledOnce();
    expect(outer).not.toHaveBeenCalled();
  });

  it("leaves Escape to an open mention list", async () => {
    const { onCancel } = setup({ initialContent: "Hi @" });
    const editor = await field();
    const popup = document.createElement("div");
    popup.className = "kaneo-mention-popup";
    document.body.appendChild(popup);
    const outer = vi.fn();
    window.addEventListener("keydown", outer);
    fireEvent.keyDown(editor, { key: "Escape" });
    window.removeEventListener("keydown", outer);
    expect(onCancel).not.toHaveBeenCalled();
    expect(outer).not.toHaveBeenCalled();
  });
});
