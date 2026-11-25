import { useCallback, useState } from "react";
import { uploadTestCaseAsset } from "@/lib/upload-test-case-asset";

// Uploads for a comment editor, and whether one is still running so the
// comment isn't sent without the file it is waiting for.
export function useCommentUpload(testCaseId: string) {
  const [uploading, setUploading] = useState(false);
  const uploadAsset = useCallback(
    async (file: File) => {
      setUploading(true);
      try {
        return await uploadTestCaseAsset(testCaseId, file);
      } finally {
        setUploading(false);
      }
    },
    [testCaseId],
  );
  return { uploadAsset, uploading };
}
