import { create } from "zustand";

// "feature" picks the feature the task belongs to; the others link tasks.
export type RelationPickerMode = "related" | "blocks" | "blockedBy" | "feature";

type RelationPickerRequest = { taskId: string; mode: RelationPickerMode };

type RelationPickerStore = {
  request: RelationPickerRequest | null;
  open: (taskId: string, mode: RelationPickerMode) => void;
  clear: () => void;
};

export const useRelationPickerStore = create<RelationPickerStore>((set) => ({
  request: null,
  open: (taskId, mode) => set({ request: { taskId, mode } }),
  clear: () => set({ request: null }),
}));
