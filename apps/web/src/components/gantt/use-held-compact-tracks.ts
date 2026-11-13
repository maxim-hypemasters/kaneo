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
// (the page reopened, the lane expanded) or when the phone layout flips.
export function useHeldCompactTracks(
  tasks: readonly ScheduledTask[],
  isMobile: boolean,
  ready: boolean,
): ScheduledTask[][] {
  const memoryRef = useRef<{
    isMobile: boolean;
    tracks: CompactTrackMemory;
  } | null>(null);
  const tracks = useMemo(() => {
    const remembered = memoryRef.current;
    return compactTaskTracks(
      tasks,
      isMobile,
      ready && remembered?.isMobile === isMobile
        ? remembered.tracks
        : undefined,
    );
  }, [tasks, isMobile, ready]);
  useEffect(() => {
    if (ready) memoryRef.current = { isMobile, tracks: rememberTracks(tracks) };
  }, [tracks, isMobile, ready]);
  return tracks;
}
