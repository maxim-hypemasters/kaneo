// Below this much room a label shows its icons without the release name.
const MIN_NAME_ROOM_DAYS = 1.5;

// How far each marker day's label can run right of its line (the day's
// centre) before the next marker day's label, or the end of the rendered
// days, in days.
export function releaseMarkerLabelWidths(
  days: ReadonlyArray<{ index: number }>,
  dayCount: number,
) {
  return days.map((day, position) => {
    const next = days[position + 1];
    const roomDays = next ? next.index - day.index : dayCount - day.index - 0.5;
    return { roomDays, iconOnly: roomDays < MIN_NAME_ROOM_DAYS };
  });
}
