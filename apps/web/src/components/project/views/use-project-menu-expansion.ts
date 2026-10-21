import { useEffect } from "react";
import { create } from "zustand";

type ProjectMenuExpansion = {
  workspaceId: string | undefined;
  currentProjectId: string | undefined;
  expanded: Set<string>;
};

// Project layouts remount during section navigation. Keep this session state
// outside the layout without writing it to persistent user preferences.
export const useProjectMenuExpansionStore = create<ProjectMenuExpansion>(
  () => ({
    workspaceId: undefined,
    currentProjectId: undefined,
    expanded: new Set(),
  }),
);

export function useProjectMenuExpansion(
  workspaceId: string | undefined,
  currentProjectId: string | undefined,
) {
  const state = useProjectMenuExpansionStore();

  useEffect(() => {
    // An unresolved workspace during a route remount is not a workspace switch.
    if (!workspaceId) return;
    useProjectMenuExpansionStore.setState((previous) => {
      if (
        previous.workspaceId === workspaceId &&
        previous.currentProjectId === currentProjectId
      )
        return previous;
      const expanded = new Set(
        previous.workspaceId === workspaceId ? previous.expanded : [],
      );
      if (currentProjectId) expanded.add(currentProjectId);
      return { workspaceId, currentProjectId, expanded };
    });
  }, [workspaceId, currentProjectId]);

  return {
    isExpanded: (projectId: string) =>
      state.workspaceId === workspaceId
        ? state.expanded.has(projectId)
        : projectId === currentProjectId,
    setExpanded: (projectId: string, open: boolean) => {
      if (!workspaceId) return;
      useProjectMenuExpansionStore.setState((previous) => {
        const expanded = new Set(
          previous.workspaceId === workspaceId ? previous.expanded : [],
        );
        if (open) expanded.add(projectId);
        else expanded.delete(projectId);
        return { workspaceId, currentProjectId, expanded };
      });
    },
  };
}
