import { create } from "zustand";
type MilestoneDetailsState = {
  projectId: string | null;
  milestoneId: string | null;
  open: (projectId: string, milestoneId: string) => void;
  close: () => void;
};
export const useMilestoneDetailsStore = create<MilestoneDetailsState>(
  (set) => ({
    projectId: null,
    milestoneId: null,
    open: (projectId, milestoneId) => set({ projectId, milestoneId }),
    close: () => set({ projectId: null, milestoneId: null }),
  }),
);
export function openMilestoneDetails(projectId: string, milestoneId: string) {
  useMilestoneDetailsStore.getState().open(projectId, milestoneId);
}
