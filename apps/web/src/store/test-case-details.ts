import { create } from "zustand";

type TestCaseDetailsState = {
  projectId: string | null;
  testCaseId: string | null;
  open: (projectId: string, testCaseId: string) => void;
  close: () => void;
};

export const useTestCaseDetailsStore = create<TestCaseDetailsState>((set) => ({
  projectId: null,
  testCaseId: null,
  open: (projectId, testCaseId) => set({ projectId, testCaseId }),
  close: () => set({ projectId: null, testCaseId: null }),
}));

export function openTestCaseDetails(projectId: string, testCaseId: string) {
  useTestCaseDetailsStore.getState().open(projectId, testCaseId);
}
