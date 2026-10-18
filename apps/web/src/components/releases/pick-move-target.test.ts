import { expect, it } from "vite-plus/test";
import { pickMoveTarget } from "./pick-move-target";

const release = (id: string, startDate: string, name = id) => ({
  id,
  name,
  startDate,
  codeFreezeDate: startDate,
  submissionDate: startDate,
});

it("points at the release that starts next", () => {
  const releases = [
    release("c", "2026-12-01"),
    release("a", "2026-10-01"),
    release("b", "2026-11-01"),
  ];
  expect(pickMoveTarget(releases, releases[1])).toBe("b");
  expect(pickMoveTarget(releases, releases[2])).toBe("c");
});

it("breaks a shared start date by name, as the list does", () => {
  const releases = [
    release("x", "2026-10-01", "2.4"),
    release("y", "2026-10-01", "2.5"),
  ];
  expect(pickMoveTarget(releases, releases[0])).toBe("y");
  expect(pickMoveTarget(releases, releases[1])).toBeNull();
});

it("falls back to no release after the last one", () => {
  const releases = [release("a", "2026-10-01"), release("b", "2026-11-01")];
  expect(pickMoveTarget(releases, releases[1])).toBeNull();
  expect(pickMoveTarget([releases[0]], releases[0])).toBeNull();
});
