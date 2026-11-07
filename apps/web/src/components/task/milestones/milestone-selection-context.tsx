import {
  createContext,
  useContext,
  useMemo,
  useState,
  useRef,
  useCallback,
  type ReactNode,
} from "react";
import type { MilestoneFilter } from "./feature-milestones";
type Selection = {
  filter: MilestoneFilter;
  setFilter: (filter: MilestoneFilter) => void;
  selectFilter: (filter: MilestoneFilter) => void;
  registerSelection: (handler: (filter: MilestoneFilter) => void) => () => void;
};
const MilestoneSelectionContext = createContext<Selection | null>(null);
// Each page/sheet keys this provider by its task, so filters never follow
// navigation to another Feature. Both responsive placements share it.
export function MilestoneSelectionProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [filter, setFilter] = useState<MilestoneFilter>("all");
  const selectionHandler = useRef<((filter: MilestoneFilter) => void) | null>(
    null,
  );
  const registerSelection = useCallback(
    (handler: (filter: MilestoneFilter) => void) => {
      selectionHandler.current = handler;
      return () => {
        if (selectionHandler.current === handler)
          selectionHandler.current = null;
      };
    },
    [],
  );
  const selectFilter = useCallback((next: MilestoneFilter) => {
    if (selectionHandler.current) selectionHandler.current(next);
    else setFilter(next);
  }, []);
  const value = useMemo(
    () => ({ filter, setFilter, selectFilter, registerSelection }),
    [filter, selectFilter, registerSelection],
  );
  return (
    <MilestoneSelectionContext.Provider value={value}>
      {children}
    </MilestoneSelectionContext.Provider>
  );
}
export function useMilestoneSelection() {
  const selection = useContext(MilestoneSelectionContext);
  if (!selection)
    throw new Error("Milestone selection requires its task view provider");
  return selection;
}
