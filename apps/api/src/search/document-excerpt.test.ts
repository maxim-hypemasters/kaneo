import { describe, expect, it } from "vite-plus/test";
import { documentExcerpt } from "./document-excerpt";

describe("documentExcerpt", () => {
  it("reads Markdown as plain text", () => {
    expect(
      documentExcerpt(
        "# Rollout\n\n- **Ship** the [checkout](https://x.test) flow\n![diagram](/a.png)",
        "ship",
      ),
    ).toBe("Rollout Ship the checkout flow diagram");
  });

  it("starts shortly before a match deep in a long page", () => {
    const body = `${"intro ".repeat(40)}the payment retry plan ${"tail ".repeat(60)}`;
    const excerpt = documentExcerpt(body, "PAYMENT")!;
    expect(excerpt.startsWith("…")).toBe(true);
    expect(excerpt.endsWith("…")).toBe(true);
    expect(excerpt).toContain("the payment retry plan");
    expect(excerpt.length).toBeLessThanOrEqual(162);
  });

  it("opens a page from its start when the match is in the title", () => {
    expect(documentExcerpt("Short body", "launch")).toBe("Short body");
  });

  it("leaves an empty page without an excerpt", () => {
    expect(documentExcerpt("  \n ", "x")).toBeUndefined();
  });
});
