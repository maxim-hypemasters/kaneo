import type { Editor } from "@tiptap/core";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { captureAnchor } from "./capture-anchor";
import { createCommentTestEditor, RICH_DOCUMENT } from "./comment-test-editor";
import {
  type DocumentTextProjection,
  projectDocumentText,
} from "./document-text";
import { resolveAnchor } from "./resolve-anchor";

let editor: Editor | undefined;

afterEach(() => editor?.destroy());

// The projection of one paragraph of already normalised text.
function flat(text: string): DocumentTextProjection {
  const starts = Array.from(text, (_, index) => index + 1);
  return { text, starts, ends: starts.map((start) => start + 1) };
}

// The text a resolved range covers in a `flat` projection.
function resolved(
  text: string,
  anchor: { quote: string; prefix?: string; suffix?: string },
) {
  const range = resolveAnchor(flat(text), {
    prefix: "",
    suffix: "",
    ...anchor,
  });
  return (
    range && {
      at: range.from - 1,
      text: text.slice(range.from - 1, range.to - 1),
    }
  );
}

describe("resolveAnchor", () => {
  it("finds the only occurrence of a quote", () => {
    expect(
      resolved("The launch plan needs a careful review today", {
        quote: "careful review",
        prefix: "plan needs a",
        suffix: "today",
      }),
    ).toEqual({ at: 24, text: "careful review" });
  });

  it("normalises the stored strings like the document text", () => {
    expect(
      resolved("The launch plan needs a careful review today", {
        quote: "  careful \n review ",
        prefix: "needs \t a ",
        suffix: "\ntoday",
      }),
    ).toEqual({ at: 24, text: "careful review" });
    expect(resolved("Some text", { quote: " \n " })).toBeNull();
  });

  it("accepts a long quote on its own even when everything around it changed", () => {
    expect(
      resolved("Rewritten start. careful review. Rewritten end.", {
        quote: "careful review",
        prefix: "plan needs a",
        suffix: "today",
      }),
    ).toEqual({ at: 17, text: "careful review" });
  });

  it("does not trust a short quote whose context is gone", () => {
    const text = "Totally different words around the plan today";
    const anchor = { quote: "plan", prefix: "the launch", suffix: "needs a" };
    expect(resolved(text, anchor)).toBeNull();
    // One matching side is enough.
    expect(resolved(text, { ...anchor, suffix: "today" })).toEqual({
      at: 35,
      text: "plan",
    });
  });

  it("does not trust a short quote on a chance match of a letter beside it", () => {
    // Only the "e" before the quote is as it was.
    expect(
      resolved("We like the plan a lot", {
        quote: "plan",
        prefix: "outline",
        suffix: "needs a",
      }),
    ).toBeNull();
  });

  it("accepts a short quote that was captured with nothing around it", () => {
    expect(resolved("Roadmap", { quote: "Roadmap" })).toEqual({
      at: 0,
      text: "Roadmap",
    });
    expect(resolved("The new Roadmap page", { quote: "Roadmap" })).toEqual({
      at: 8,
      text: "Roadmap",
    });
  });

  it("tells repeated quotes apart by their context", () => {
    const text =
      "the draft is ready and the draft is short and the draft is late";
    expect(
      resolved(text, {
        quote: "the draft",
        prefix: "is ready and",
        suffix: "is short",
      }),
    ).toEqual({ at: 23, text: "the draft" });
    expect(
      resolved(text, {
        quote: "the draft",
        prefix: "short and",
        suffix: "is late",
      }),
    ).toEqual({ at: 46, text: "the draft" });
    // Half of the context still decides.
    expect(
      resolved(text, { quote: "the draft", prefix: "gone", suffix: "is late" }),
    ).toEqual({ at: 46, text: "the draft" });
  });

  it("takes the earliest of equally good repeats and none when nothing matches", () => {
    const text = "one item, one item, one item";
    expect(
      resolved(text, { quote: "item", prefix: "one", suffix: "" }),
    ).toEqual({ at: 4, text: "item" });
    expect(
      resolved(text, { quote: "item", prefix: "two", suffix: "three" }),
    ).toBeNull();
    expect(resolved(text, { quote: "item" })).toBeNull();
  });

  it("falls back to the text between the old neighbours when the quote was reworded", () => {
    const anchor = {
      quote: "careful review",
      prefix: "The plan needs a",
      suffix: "before the launch",
    };
    expect(
      resolved(
        "The plan needs a thorough second look before the launch.",
        anchor,
      ),
    ).toEqual({ at: 17, text: "thorough second look" });
  });

  it("limits the fallback to a believable length and to solid context", () => {
    const anchor = {
      quote: "careful review",
      prefix: "The plan needs a",
      suffix: "before the launch",
    };
    const long = "word ".repeat(16).trim();
    expect(long.length).toBeGreaterThan(anchor.quote.length + 64);
    expect(
      resolved(`The plan needs a ${long} before the launch.`, anchor),
    ).toBeNull();
    // Nothing is left between the neighbours.
    expect(resolved("The plan needs a before the launch.", anchor)).toBeNull();
    // Context shorter than eight characters could match anywhere.
    expect(
      resolved("The plan needs a thorough look before the launch.", {
        ...anchor,
        prefix: "needs a",
      }),
    ).toBeNull();
    expect(
      resolved("Nothing of the old text is left here.", anchor),
    ).toBeNull();
  });

  it("prefers the fallback span closest in length to the quote", () => {
    const text =
      "Section one: a very long passage that was rewritten entirely. End of part. " +
      "Section one: short bit. End of part.";
    expect(
      resolved(text, {
        quote: "small bit",
        prefix: "Section one:",
        suffix: "End of part.",
      }),
    ).toEqual({ at: 88, text: "short bit." });
  });

  it("returns the range it was captured from, for every stretch of a document", () => {
    editor = createCommentTestEditor(RICH_DOCUMENT);
    const projection = projectDocumentText(editor.state.doc);
    const { text, starts, ends } = projection;
    let checked = 0;
    for (const length of [1, 4, 17, 60, 240]) {
      for (let start = 0; start + length <= text.length; start += 3) {
        const captured = captureAnchor(
          projection,
          starts[start],
          ends[start + length - 1],
        );
        if (!captured) continue;
        const range = resolveAnchor(projection, captured.anchor);
        expect(range, captured.anchor.quote).not.toBeNull();
        const again = captureAnchor(projection, range!.from, range!.to);
        expect(again?.anchor).toEqual(captured.anchor);
        // Only a repeat with identical surroundings may resolve elsewhere.
        if (
          text.indexOf(captured.anchor.quote) ===
          text.lastIndexOf(captured.anchor.quote)
        )
          expect(range).toEqual(captured.range);
        checked += 1;
      }
    }
    expect(checked).toBeGreaterThan(500);
  });

  it("finds every anchor again after the document is saved as Markdown and reloaded", () => {
    editor = createCommentTestEditor(RICH_DOCUMENT);
    const before = projectDocumentText(editor.state.doc);
    const anchors = [];
    for (const length of [1, 5, 23, 90]) {
      for (let start = 0; start + length <= before.text.length; start += 7) {
        const captured = captureAnchor(
          before,
          before.starts[start],
          before.ends[start + length - 1],
        );
        if (captured) anchors.push(captured.anchor);
      }
    }
    expect(anchors.length).toBeGreaterThan(150);
    expect(anchors.some(({ quote }) => quote.includes("@Client dev"))).toBe(
      true,
    );
    expect(anchors.some(({ quote }) => quote.includes("KAN-12"))).toBe(true);
    expect(anchors.some(({ quote }) => quote.includes("🚀"))).toBe(true);

    editor.commands.setContent(editor.getMarkdown(), {
      contentType: "markdown",
    });
    const after = projectDocumentText(editor.state.doc);
    expect(after.starts).not.toEqual(before.starts);
    for (const anchor of anchors) {
      const range = resolveAnchor(after, anchor);
      expect(range, anchor.quote).not.toBeNull();
      expect(captureAnchor(after, range!.from, range!.to)?.anchor).toEqual(
        anchor,
      );
    }
  });
});
