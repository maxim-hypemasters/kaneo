import { useEffect, useMemo, useRef } from "react";
import {
  type CompactTrackMemory,
  compactTaskTracks,
  rememberTracks,
} from "./compact-task-tracks";
import type { ScheduledTask } from "./gantt-types";

// A lane's compact tracks, holding still while its bars are moved or resized
// (see compactTaskTracks). They are remembered only once everything that
// places the bars has loaded (`ready`), and packed afresh on a new mount
// (the page reopened, the lane expanded) or when the phone layout or hidden
// weekends flip.
export function useHeldCompactTracks(
  tasks: readonly ScheduledTask[],
  isMobile: boolean,
  ready: boolean,
  hideWeekends = false,
): ScheduledTask[][] {
  const memoryRef = useRef<{
    isMobile: boolean;
    hideWeekends: boolean;
    tracks: CompactTrackMemory;
  } | null>(null);
  const tracks = useMemo(() => {
    const remembered = memoryRef.current;
    return compactTaskTracks(
      tasks,
      isMobile,
      ready &&
        remembered?.isMobile === isMobile &&
        remembered.hideWeekends === hideWeekends
        ? remembered.tracks
        : undefined,
      hideWeekends,
    );
  }, [tasks, isMobile, ready, hideWeekends]);
  useEffect(() => {
    if (ready)
      memoryRef.current = {
        isMobile,
        hideWeekends,
        tracks: rememberTracks(tracks, hideWeekends),
      };
  }, [tracks, isMobile, ready, hideWeekends]);
  return tracks;
}
