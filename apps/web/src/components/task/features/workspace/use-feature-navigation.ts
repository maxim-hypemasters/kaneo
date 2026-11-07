import { useNavigate, useSearch } from "@tanstack/react-router";
import { useCallback } from "react";
import { useDocumentDraftNavigation } from "@/components/editor/document-draft-guard";
import {
  validateFeatureWorkspaceSearch,
  type FeatureTab,
} from "./feature-workspace-search";

export function useFeatureNavigation() {
  const search = useSearch({ strict: false });
  const state = validateFeatureWorkspaceSearch(search);
  const navigate = useNavigate();
  const requestLeave = useDocumentDraftNavigation();
  const open = useCallback(
    (tab: FeatureTab, contentId?: string, afterLeave?: () => void) => {
      void requestLeave(() => {
        afterLeave?.();
        void navigate({
          to: ".",
          search: (previous: Record<string, unknown>) => ({
            ...previous,
            featureTab: tab,
            featureDocumentId: tab === "documents" ? contentId : undefined,
            featureUpdateId: tab === "activity" ? contentId : undefined,
          }),
          resetScroll: false,
        });
      });
    },
    [navigate, requestLeave],
  );
  return { ...state, tab: state.featureTab ?? "overview", open };
}
