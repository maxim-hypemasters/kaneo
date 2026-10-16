import { differenceInCalendarDays } from "date-fns";

// Lane headers stay compact: features past this many overlapping tracks go
// into a "+N" chip instead.
export const MAX_FEATURE_TRACKS = 3;

type Span = { start: Date; end: Date };

export type PackedFeatureTracks<T extends Span> = {
  placed: (T & { track: number })[];
  overflow: T[];
  trackCount: number;
};

// Greedy interval packing in start order: each span takes the first track
// whose last span ends strictly before it starts (bars include their end
// day, so ending and starting on the same day overlaps). Spans that fit no
// track once `maxTracks` are in use overflow, in start order.
export function packFeatureTracks<T extends Span>(
  spans: readonly T[],
  maxTracks: number = MAX_FEATURE_TRACKS,
): PackedFeatureTracks<T> {
  // Stable, so spans with the same dates keep the caller's order.
  const ordered = [...spans].sort(
    (left, right) =>
      left.start.getTime() - right.start.getTime() ||
      left.end.getTime() - right.end.getTime(),
  );
  const trackEnds: Date[] = [];
  const placed: (T & { track: number })[] = [];
  const overflow: T[] = [];

  for (const span of ordered) {
    let track = trackEnds.findIndex(
      (end) => differenceInCalendarDays(span.start, end) > 0,
    );
    if (track === -1 && trackEnds.length < maxTracks) {
      track = trackEnds.length;
      trackEnds.push(span.end);
    }
    if (track === -1) {
      overflow.push(span);
      continue;
    }
    trackEnds[track] = span.end;
    placed.push({ ...span, track });
  }

  return { placed, overflow, trackCount: trackEnds.length };
}
