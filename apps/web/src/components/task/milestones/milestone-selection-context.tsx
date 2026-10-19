import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { MilestoneFilter } from "./feature-milestones";
type Selection = {
  filter: MilestoneFilter;
  setFilter: (filter: MilestoneFilter) => void;
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
  const value = useMemo(() => ({ filter, setFilter }), [filter]);
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
