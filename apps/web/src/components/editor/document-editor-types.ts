import type { ReactNode } from "react";
import type { uploadTaskImage } from "@/lib/upload-task-image";

export type UploadedDocumentAsset = Awaited<ReturnType<typeof uploadTaskImage>>;

export type DocumentEditorProps = {
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
