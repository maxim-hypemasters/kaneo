import type { Editor } from "@tiptap/core";

// Marks the empty line added below the last block. It only gives the caret a
// place to go, so it is not reported as an edit (and not autosaved) until
// someone types on it.
export const DOCUMENT_END_LINE_META = "kaneoDocumentEndLine";

// StarterKit runs with `trailingNode: false`, so a document that ends in a
// table, list, code block or embed has no line after it to type on. Add one.
export function focusDocumentEnd(editor: Editor) {
  if (!editor.isEditable) return;
  const last = editor.state.doc.lastChild;
  if (last?.isTextblock && last.type.name !== "codeBlock") {
    editor.commands.focus("end");
  } else {
    editor
      .chain()
      .command(({ tr }) => {
        tr.setMeta(DOCUMENT_END_LINE_META, true);
        return true;
      })
      .insertContentAt(editor.state.doc.content.size, { type: "paragraph" })
      .focus("end")
      .run();
  }
  // TipTap focuses the DOM a frame later, so keys typed right after the click
  // would still reach whatever had focus before (such as the title).
  editor.view.focus();
}
