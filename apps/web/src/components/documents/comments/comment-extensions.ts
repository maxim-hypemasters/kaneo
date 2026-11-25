import { Markdown } from "@tiptap/markdown";
import StarterKit from "@tiptap/starter-kit";
import { KaneoMention } from "@/components/task/extensions/kaneo-mention";
import { SafeHardBreak } from "@/components/task/extensions/safe-hard-break";

// What a comment on a document can hold: paragraphs, lists, inline styles,
// links and mentions. Writing and reading share this list so both parse the
// stored Markdown the same way.
export function commentExtensions() {
  return [
    StarterKit.configure({
      heading: false,
      codeBlock: false,
      blockquote: false,
      horizontalRule: false,
      hardBreak: false,
      trailingNode: false,
    }),
    SafeHardBreak,
    Markdown.configure({ markedOptions: { breaks: true, gfm: true } }),
    KaneoMention,
  ];
}
