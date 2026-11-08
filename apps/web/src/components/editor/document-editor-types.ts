import type { ReactNode, Ref } from "react";
import type { uploadTaskImage } from "@/lib/upload-task-image";

export type UploadedDocumentAsset = Awaited<ReturnType<typeof uploadTaskImage>>;

export type DocumentEditorHandle = {
  focus: (position: "start" | "end") => void;
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
};
