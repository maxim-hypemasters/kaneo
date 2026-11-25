import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { extractIssueKeyFromUrl } from "@/lib/editor-url-utils";
import { isWhitespace } from "./normalize-text";

// `text[i]` came from the ProseMirror range `[starts[i], ends[i])`. Both
// arrays never decrease, so they can be searched by bisection.
export type DocumentTextProjection = {
  text: string;
  starts: number[];
  ends: number[];
};

// Plain text of a document as a reader sees it, with every run of whitespace
// and every boundary between blocks collapsed to one space. Saving a document
// as Markdown and loading it again moves whitespace around (an issue link or
// attachment is written on its own line, an embed gains empty paragraphs), and
// a comment anchor has to find its text after that.
export function projectDocumentText(
  doc: ProseMirrorNode,
): DocumentTextProjection {
  const units: string[] = [];
  const starts: number[] = [];
  const ends: number[] = [];
  let spacePending = false;

  const append = (value: string, pos: number, atomSize = 0) => {
    for (let index = 0; index < value.length; index += 1) {
      const unit = value[index];
      if (isWhitespace(unit)) {
        spacePending = true;
        continue;
      }
      const from = atomSize ? pos : pos + index;
      const to = atomSize ? pos + atomSize : from + 1;
      if (spacePending && units.length > 0) {
        // The space stands for everything between its neighbours. Inside an
        // atom there is no such gap, so it shares the atom's range.
        const gap = ends[ends.length - 1];
        units.push(" ");
        starts.push(gap < from ? gap : from);
        ends.push(gap < from ? from : to);
      }
      spacePending = false;
      units.push(unit);
      starts.push(from);
      ends.push(to);
    }
  };

  doc.descendants((node, pos) => {
    if (node.isText) {
      append(node.text ?? "", pos);
      return;
    }
    if (node.type.name === "kaneoMention") {
      append(`@${node.attrs.label || ""}`, pos, node.nodeSize);
      return;
    }
    // Everything else separates words: blocks, hard breaks, and the inline
    // cards that Markdown writes on a line of their own.
    spacePending = true;
    if (node.type.name === "kaneoIssueLink") {
      // The key is read from the URL, where the `issueKey` attribute itself
      // comes from, so a link whose attribute is empty reads the same.
      append(
        extractIssueKeyFromUrl(String(node.attrs.url || "")) ?? "",
        pos,
        node.nodeSize,
      );
      spacePending = true;
    }
  });

  return { text: units.join(""), starts, ends };
}
