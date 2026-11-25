import { describe, expect, it } from "vite-plus/test";
import { descriptionForEditor } from "./description-for-editor";

describe("descriptionForEditor", () => {
  it("keeps the editor's own text when a save only trimmed it", () => {
    expect(
      descriptionForEditor("# Goals\n\n- ship\n\n", "# Goals\n\n- ship"),
    ).toBe("# Goals\n\n- ship\n\n");
  });

  it("keeps the editor's text while the form holds it unchanged", () => {
    expect(descriptionForEditor("Draft ", "Draft ")).toBe("Draft ");
  });

  it("takes a different description from the form", () => {
    expect(descriptionForEditor("Old text", "Someone else's text")).toBe(
      "Someone else's text",
    );
  });

  it("takes an emptied description from the form", () => {
    expect(descriptionForEditor("Old text", "")).toBe("");
  });
});
