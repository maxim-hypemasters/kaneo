import { useCallback, useLayoutEffect, useRef, useState } from "react";
import type { GanttBarAway, GanttTaskEdit } from "../gantt-types";

type DragHint = { x: number; y: number; label: string };

// What a bar's drag or resize says, beside the pointer, while the dates it
// shows would put the work on a day its assignee is away. Pointer handlers
// outlive renders, so they read the latest `away` through a ref.
export function useAwayDragHint(away: GanttBarAway | undefined) {
  const awayRef = useRef(away);
  useLayoutEffect(() => {
    awayRef.current = away;
  });
  const [hint, setHint] = useState<DragHint | null>(null);

  // Why `edit` can't be saved, or null.
  const blockedLabel = useCallback(
    (edit: GanttTaskEdit) => awayRef.current?.blockedHint(edit) ?? null,
    [],
  );
  // Shows (or hides) the hint for the dates under the pointer.
  const follow = useCallback(
    (x: number, y: number, edit: GanttTaskEdit) => {
      const label = blockedLabel(edit);
      setHint((current) =>
        !label
          ? null
          : current?.x === x && current.y === y && current.label === label
            ? current
            : { x, y, label },
      );
    },
    [blockedLabel],
  );
  const clear = useCallback(() => setHint(null), []);

  return { hint, blockedLabel, follow, clear };
}
