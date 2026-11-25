import type { Editor } from "@tiptap/core";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { createCommentTestEditor } from "./comment-test-editor";
import { scrollToRange } from "./scroll-to-range";

let editor: Editor;
let scroller: HTMLDivElement;
const scrollTo = vi.fn();

afterEach(() => {
  editor.destroy();
  scroller.remove();
  vi.clearAllMocks();
});

// A 400px scroller at the top of the screen, scrolled 500px into its content,
// with the editor inside a dialog-like ancestor that must not move.
function mount(lines: { top: number; bottom: number }) {
  editor = createCommentTestEditor("One paragraph of text");
  const dialog = document.createElement("div");
  dialog.style.overflowY = "auto";
  scroller = document.createElement("div");
  scroller.style.overflowY = "auto";
  Object.defineProperties(scroller, {
    scrollHeight: { value: 2000 },
    clientHeight: { value: 400 },
    scrollTop: { value: 500 },
    scrollTo: { value: scrollTo },
    getBoundingClientRect: { value: () => new DOMRect(0, 100, 600, 400) },
  });
  const plain = document.createElement("div");
  plain.append(editor.view.dom);
  scroller.append(plain);
  dialog.append(scroller);
  document.body.append(dialog);
  vi.spyOn(editor.view, "coordsAtPos").mockImplementation((pos) => ({
    left: 0,
    right: 0,
    top: pos === 3 ? lines.top : lines.bottom - 20,
    bottom: pos === 3 ? lines.top + 20 : lines.bottom,
  }));
}

describe("scrollToRange", () => {
  it("scrolls the nearest scroller so the range sits a third of the way down", () => {
    mount({ top: 900, bottom: 940 });
    scrollToRange(editor, { from: 3, to: 9 });
    // 800px below the scroller's top edge, less a third of its height.
    expect(scrollTo).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ top: 500 + 800 - 400 / 3 }),
    );
  });

  it("scrolls back up to a range above the visible part", () => {
    mount({ top: -200, bottom: -180 });
    scrollToRange(editor, { from: 3, to: 9 });
    expect(scrollTo).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ top: 500 - 300 - 400 / 3 }),
    );
  });

  it("leaves a range alone that is already comfortably in view", () => {
    mount({ top: 200, bottom: 260 });
    scrollToRange(editor, { from: 3, to: 9 });
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it("does nothing when no ancestor can scroll", () => {
    mount({ top: 900, bottom: 940 });
    document.body.append(editor.view.dom);
    scrollToRange(editor, { from: 3, to: 9 });
    expect(scrollTo).not.toHaveBeenCalled();
  });
});
