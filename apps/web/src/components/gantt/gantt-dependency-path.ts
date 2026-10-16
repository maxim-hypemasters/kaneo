type Point = { x: number; y: number };

// How far a connector leaves the blocker before turning.
export const DEPENDENCY_STUB_PX = 8;

// An orthogonal connector from the end of a blocking bar to the start of the
// bar it blocks. When the blocked bar starts before there is room to turn
// (it starts left of the blocker's end, or just after), the line detours
// along the edge of the blocked task's row, on the blocker's side, instead
// of crossing the bars or the rows in between.
export function dependencyPath(
  from: Point,
  to: Point,
  blockedRowHalfHeight: number,
) {
  const turnX = from.x + DEPENDENCY_STUB_PX;
  if (to.x - from.x >= 2 * DEPENDENCY_STUB_PX) {
    return `M ${from.x} ${from.y} H ${turnX} V ${to.y} H ${to.x}`;
  }
  const jogY = to.y - Math.sign(to.y - from.y) * blockedRowHalfHeight;
  return `M ${from.x} ${from.y} H ${turnX} V ${jogY} H ${to.x - DEPENDENCY_STUB_PX} V ${to.y} H ${to.x}`;
}
