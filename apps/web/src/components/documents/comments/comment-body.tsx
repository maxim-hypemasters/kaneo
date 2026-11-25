import { EditorContent, useEditor } from "@tiptap/react";
import { useEffect } from "react";
import { commentExtensions } from "./comment-extensions";

// A comment as posted. It is rendered by the editor that wrote it, so
// mentions and formatting read the same in both.
export function CommentBody({ content }: { content: string }) {
  const editor = useEditor(
    {
      immediatelyRender: false,
      editable: false,
      content,
      contentType: "markdown",
      extensions: commentExtensions(),
      editorProps: {
        attributes: { class: "kaneo-comment-editor-prose text-[13px]" },
      },
    },
    [],
  );
  useEffect(() => {
    editor?.commands.setContent(content, {
      emitUpdate: false,
      contentType: "markdown",
    });
  }, [editor, content]);
  return <EditorContent editor={editor} />;
}
