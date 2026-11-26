// Below this much room a label shows its icons without the release name.
const MIN_NAME_ROOM_DAYS = 1.5;

// Where a marker day's line sits, in days: the day's centre, or the left
// edge of the day for a marker pinned to a hidden weekend's boundary.
export function releaseMarkerLinePosition(day: {
  index: number;
  pinned?: boolean;
}) {
  return day.index + (day.pinned ? 0 : 0.5);
}

// How far each marker day's label can run right of its line before the next
// marker day's label, or the end of the rendered days, in days.
export function releaseMarkerLabelWidths(
  days: ReadonlyArray<{ index: number; pinned?: boolean }>,
  dayCount: number,
) {
  return days.map((day, position) => {
    const next = days[position + 1];
    const line = releaseMarkerLinePosition(day);
    const roomDays = next ? releaseMarkerLinePosition(next) - line : dayCount - line;
    return { roomDays, iconOnly: roomDays < MIN_NAME_ROOM_DAYS };
  });
}
