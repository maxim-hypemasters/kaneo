import { describe, expect, it } from "vite-plus/test";
import { descriptionExcerpt } from "./description-excerpt";

describe("descriptionExcerpt", () => {
  it("returns nothing for an empty description", () => {
    expect(descriptionExcerpt(null)).toBe("");
    expect(descriptionExcerpt("\n\n  \n")).toBe("");
  });

  it("keeps plain text as it is", () => {
    expect(descriptionExcerpt("Ship the new board.")).toBe(
      "Ship the new board.",
    );
  });

  it("drops heading, list, quote and checklist markers", () => {
    expect(descriptionExcerpt("## Goals\n\nMore")).toBe("Goals");
    expect(descriptionExcerpt("- [ ] Launch beta")).toBe("Launch beta");
    expect(descriptionExcerpt("1. First step")).toBe("First step");
    expect(descriptionExcerpt("> Quoted aim")).toBe("Quoted aim");
  });

  it("strips inline formatting, links and code", () => {
    expect(
      descriptionExcerpt(
        "A **bold** and _quiet_ plan with `code` and [docs](https://example.com).",
      ),
    ).toBe("A bold and quiet plan with code and docs.");
  });

  it("skips lines that hold only images, rules or code fences", () => {
    expect(
      descriptionExcerpt(
        "![Logo](/api/asset/abc123)\n\n---\n\n```ts\nconst x = 1;\n```\n\nThe real summary",
      ),
    ).toBe("The real summary");
  });

  it("shows mentions by their label", () => {
    expect(
      descriptionExcerpt(
        'Owned by <kaneo-mention id="u1" label="Sam"></kaneo-mention>',
      ),
    ).toBe("Owned by @Sam");
  });

  it("keeps underscores inside words", () => {
    expect(descriptionExcerpt("Rename snake_case_names")).toBe(
      "Rename snake_case_names",
    );
  });
});
