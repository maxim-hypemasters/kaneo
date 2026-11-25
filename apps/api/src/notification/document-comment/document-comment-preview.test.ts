import { describe, expect, it } from "vite-plus/test";
import { documentCommentPreview } from "./document-comment-preview";

describe("documentCommentPreview", () => {
  it("writes mentions as @name", () => {
    expect(
      documentCommentPreview(
        'Thanks <kaneo-mention id="u1" label="Ana Lima"></kaneo-mention>, **done**.',
      ),
    ).toBe("Thanks @Ana Lima, done.");
  });

  it("reads the label wherever the attribute sits", () => {
    expect(
      documentCommentPreview(
        '<kaneo-mention label="Ben" id="u2"></kaneo-mention> see [the plan](https://example.com)',
      ),
    ).toBe("@Ben see the plan");
  });

  it("drops a mention without a name and other markup", () => {
    expect(
      documentCommentPreview(
        'Hi <kaneo-mention id="u3" label=""></kaneo-mention><br>there',
      ),
    ).toBe("Hi there");
  });

  it("drops bold, strikethrough and code marks", () => {
    expect(
      documentCommentPreview("Moved to **Monday**, ~~not~~ `v2` at 2*3"),
    ).toBe("Moved to Monday, not v2 at 2*3");
  });

  it("returns null when nothing readable is left", () => {
    expect(documentCommentPreview("![shot](https://example.com/a.png)")).toBe(
      null,
    );
  });

  it("shortens long comments", () => {
    const preview = documentCommentPreview("word ".repeat(100));
    expect(preview?.length).toBeLessThanOrEqual(240);
    expect(preview?.endsWith("…")).toBe(true);
  });
});
