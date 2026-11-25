import { Schema } from "@tiptap/pm/model";
import { EditorState, NodeSelection, TextSelection } from "@tiptap/pm/state";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { canFormatSelection, isEditing } from "./formatting-menu-visibility";

const schema = new Schema({
  nodes: {
    doc: { content: "block+" },
    paragraph: { group: "block", content: "text*" },
    image: { group: "block", attrs: { src: { default: "" } } },
    text: {},
  },
});

// An image followed by "Hello".
const doc = schema.node("doc", null, [
  schema.node("image", { src: "/api/asset/a1" }),
  schema.node("paragraph", null, [schema.text("Hello")]),
]);

describe("canFormatSelection", () => {
  it("allows selected text", () => {
    expect(canFormatSelection(TextSelection.create(doc, 2, 5), false)).toBe(
      true,
    );
  });

  it("refuses a selected image, as a document opening on one starts", () => {
    const opening = EditorState.create({ schema, doc }).selection;
    expect(opening).toBeInstanceOf(NodeSelection);
    expect(canFormatSelection(opening, false)).toBe(false);
  });

  it("refuses a caret and text in a code block", () => {
    expect(canFormatSelection(TextSelection.create(doc, 3), false)).toBe(false);
    expect(canFormatSelection(TextSelection.create(doc, 2, 5), true)).toBe(
      false,
    );
  });
});

describe("isEditing", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("follows the editor's focus", () => {
    const menu = document.createElement("div");
    expect(isEditing({ hasFocus: () => true }, menu)).toBe(true);
    expect(isEditing({ hasFocus: () => false }, menu)).toBe(false);
  });

  it("stays true while a menu button has focus", () => {
    const menu = document.createElement("div");
    const button = document.createElement("button");
    menu.append(button);
    document.body.append(menu);
    button.focus();
    expect(isEditing({ hasFocus: () => false }, menu)).toBe(true);
  });
});
