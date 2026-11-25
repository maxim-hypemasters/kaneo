// A comment thread points at document text by quoting it. The quote and its
// surrounding context are plain text as rendered, never Markdown.
export type CommentAnchor = { quote: string; prefix: string; suffix: string };

export type CommentAnchorUpdate = CommentAnchor & { id: string };

// A ProseMirror range in the current editor document.
export type CommentRange = { from: number; to: number };

export const MAX_QUOTE_LENGTH = 1000;
export const CONTEXT_LENGTH = 32;
