import { describe, expect, it } from "vite-plus/test";
import { keepRowOrder } from "./keep-row-order";

const task = (id: string, start: string) => ({
  id,
  scheduleStart: new Date(start),
});
const ids = (tasks: readonly { id: string }[]) => tasks.map((item) => item.id);

describe("Gantt row order", () => {
  it("opens in the given start-date order", () => {
    const tasks = [task("a", "2026-10-01"), task("b", "2026-10-05")];
    expect(ids(keepRowOrder(tasks, undefined))).toEqual(["a", "b"]);
  });

  it("keeps each task's row after its dates change", () => {
    expect(
      ids(
        keepRowOrder(
          [
            task("b", "2026-10-05"),
            task("c", "2026-10-09"),
            task("a", "2026-10-20"),
          ],
          ["a", "b", "c"],
        ),
      ),
    ).toEqual(["a", "b", "c"]);
  });

  it("drops tasks that are gone and puts new ones by start date", () => {
    expect(
      ids(
        keepRowOrder(
          [
            task("early", "2026-09-01"),
            task("a", "2026-10-01"),
            task("middle", "2026-10-03"),
            task("c", "2026-10-09"),
            task("late", "2026-12-01"),
          ],
          ["a", "b", "c"],
        ),
      ),
    ).toEqual(["early", "a", "middle", "c", "late"]);
  });
});
