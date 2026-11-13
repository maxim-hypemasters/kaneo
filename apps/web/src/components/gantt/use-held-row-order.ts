import { useEffect, useMemo, useRef } from "react";
import type { ScheduledTask } from "./gantt-types";
import { keepRowOrder } from "./keep-row-order";

// Rows in the order the chart opened in; see keepRowOrder. The order is only
// remembered once everything that places the bars has loaded (`ready`), so a
// layout made from half the data isn't the one that sticks.
export function useHeldRowOrder(
  tasks: readonly ScheduledTask[],
  ready: boolean,
): ScheduledTask[] {
  const idsRef = useRef<readonly string[] | undefined>(undefined);
  const ordered = useMemo(
    () => keepRowOrder(tasks, ready ? idsRef.current : undefined),
    [tasks, ready],
  );
  useEffect(() => {
    if (ready) idsRef.current = ordered.map((task) => task.id);
  }, [ordered, ready]);
  return ordered;
}
