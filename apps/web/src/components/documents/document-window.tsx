import {
  DocumentWindowContent,
  type DocumentWindowProps,
} from "./document-window-content";
import { DocumentWindowFrame } from "./document-window-frame";
import { useDocumentWindowFrame } from "./document-window-frame-context";

// An open document takes the whole screen; closing it returns to the
// documents list underneath. Inside a DocumentWindowFrame it fills that
// frame, which stays open while documents change; on its own it opens one.
export function DocumentWindow(props: DocumentWindowProps) {
  const frame = useDocumentWindowFrame();
  if (frame) return <DocumentWindowContent {...props} />;
  return (
    <DocumentWindowFrame onClose={props.onClose}>
      <DocumentWindowContent {...props} />
    </DocumentWindowFrame>
  );
}
