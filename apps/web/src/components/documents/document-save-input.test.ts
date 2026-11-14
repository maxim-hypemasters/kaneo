import { describe, expect, it } from "vite-plus/test";
import { documentSaveInput } from "./document-save-input";

const saved = { title: "Design", body: "Original", revision: 4 };
const none = new Set<string>();

describe("documentSaveInput", () => {
  it("returns null when nothing changed", () => {
    expect(
      documentSaveInput({ title: "Design", body: "Original" }, saved, none),
    ).toBeNull();
    expect(
      documentSaveInput({ title: " Design  ", body: "Original" }, saved, none),
    ).toBeNull();
  });

  it("sends a trimmed title alone and never a blank one", () => {
    expect(
      documentSaveInput({ title: " Plan ", body: "Original" }, saved, none),
    ).toEqual({ title: "Plan", expectedRevision: 4 });
    expect(
      documentSaveInput({ title: "   ", body: "Original" }, saved, none),
    ).toBeNull();
    expect(
      documentSaveInput({ title: "", body: "Edited" }, saved, none),
    ).toEqual({ body: "Edited", expectedRevision: 4 });
  });

  it("sends a changed body alone", () => {
    expect(
      documentSaveInput({ title: "Design", body: "Edited" }, saved, none),
    ).toEqual({ body: "Edited", expectedRevision: 4 });
  });

  it("claims only staged uploads the body refers to", () => {
    const staged = new Set(["kept", "removed"]);
    expect(
      documentSaveInput(
        { title: "Design", body: "![a](/api/asset/kept)" },
        saved,
        staged,
      ),
    ).toEqual({
      body: "![a](/api/asset/kept)",
      expectedRevision: 4,
      draftAssetIds: ["kept"],
    });
    // A title-only save sends no body, so it claims nothing.
    expect(
      documentSaveInput(
        { title: "Plan", body: "![a](/api/asset/kept)" },
        { ...saved, body: "![a](/api/asset/kept)" },
        staged,
      ),
    ).toEqual({ title: "Plan", expectedRevision: 4 });
  });
});
