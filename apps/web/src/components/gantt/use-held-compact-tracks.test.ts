import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vite-plus/test";
import type { ScheduledLeaf, ScheduledTask } from "./gantt-types";
import { useHeldCompactTracks } from "./use-held-compact-tracks";

function task(id: string, start: string, end: string) {
  return {
    id,
    scheduleStart: new Date(start),
    scheduleEnd: new Date(end),
  } as ScheduledLeaf;
}
const ids = (tracks: ScheduledTask[][]) =>
  tracks.map((track) => track.map((item) => item.id));

describe("useHeldCompactTracks", () => {
  it("packs afresh by the drawn days when weekends are hidden or shown", () => {
    // 2026-09-05 is a Saturday; hidden, it is drawn on Monday.
    const tasks = [
      task("sat", "2026-09-05T00:00", "2026-09-05T00:00"),
      task("mon", "2026-09-07T00:00", "2026-09-08T00:00"),
    ];
    const hook = renderHook(
      ({ hideWeekends }) =>
        useHeldCompactTracks(tasks, false, true, hideWeekends),
      { initialProps: { hideWeekends: false } },
    );
    expect(ids(hook.result.current)).toEqual([["sat", "mon"]]);

    hook.rerender({ hideWeekends: true });
    expect(ids(hook.result.current)).toEqual([["sat"], ["mon"]]);

    hook.rerender({ hideWeekends: false });
    expect(ids(hook.result.current)).toEqual([["sat", "mon"]]);
  });
});
