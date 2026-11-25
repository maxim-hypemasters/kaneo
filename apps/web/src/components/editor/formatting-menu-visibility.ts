import { NodeSelection, type Selection } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";

// Someone is editing: the editor or one of its menus has focus. A document
// opens with a selection already in place, so without this a menu would show
// on load before anyone clicked.
export function isEditing(view: Pick<EditorView, "hasFocus">, menu: Element) {
  return view.hasFocus() || menu.contains(document.activeElement);
}

// Marks apply to selected text: not to a selected image or embed, and not
// inside a code block.
export function canFormatSelection(selection: Selection, inCodeBlock: boolean) {
  return (
    !selection.empty && !(selection instanceof NodeSelection) && !inCodeBlock
  );
}
