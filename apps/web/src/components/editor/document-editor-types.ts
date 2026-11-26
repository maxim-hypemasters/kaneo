import type { Editor } from "@tiptap/core";
import type { ReactNode, Ref } from "react";
import type { MentionMember } from "@/components/task/extensions/mention-list";
import type { uploadTaskImage } from "@/lib/upload-task-image";

export type UploadedDocumentAsset = Awaited<ReturnType<typeof uploadTaskImage>>;

export type DocumentEditorHandle = {
  focus: (position: "start" | "end") => void;
};

export type DocumentEditorComments = {
  // Receives the editor once it exists and null on teardown. Must be stable.
  onEditor: (editor: Editor | null) => void;
  onThreadClick: (threadId: string) => void;
  // Absent for people who cannot comment.
  onAdd?: () => void;
};

export type DocumentEditorProps = {
  // "page" fills its container like a document page: no toolbar or border,
  // and clicking below the text moves the caret to the end.
  variant?: "inline" | "page";
  ref?: Ref<DocumentEditorHandle>;
  value: string;
  onChange?: (value: string) => void;
  onRequestEdit?: () => void;
  ariaLabel: string;
  placeholder?: string;
  readOnly?: boolean;
  disabled?: boolean;
  uploadAsset?: (file: File) => Promise<UploadedDocumentAsset>;
  onPendingUploadChange?: (pending: boolean) => void;
  documentKey?: string;
  className?: string;
  footer?: ReactNode;
  headerActions?: ReactNode;
  notice?: ReactNode;
  // False when the editor already fills the screen, so it offers no Expand.
  expandable?: boolean;
  // Comment highlights are an editor extension, and extensions are fixed when
  // the editor is created: pass this from the first render or never.
  comments?: DocumentEditorComments;
  // The people an @ can name. Like comments, the picker is offered only when
  // this is passed from the first render; the list itself may change.
  mentionMembers?: MentionMember[];
};
